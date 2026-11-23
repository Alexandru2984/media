"""Profile metadata authorization/validation inside the disposable DB harness."""
import html
import json
import os
import socket
import subprocess
import time
import urllib.error
import urllib.request
import uuid


def check_profile_details(base, ids, tokens, sql, database, environment, root, log):
    checks = 0

    def request(method, path, payload=None, viewer="public", expected=200, origin="http://127.0.0.1:3005", target_base=None):
        nonlocal checks
        headers = {"Origin": origin}
        if viewer:
            headers["Cookie"] = f"media_session={tokens[viewer]}"
        if payload is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request((target_base or base)+path, method=method, headers=headers,
                                     data=json.dumps(payload).encode() if payload is not None else None)
        try:
            response = urllib.request.urlopen(req, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            body = response.read()
            assert response.status == expected, f"profile {method} {path}: {response.status} != {expected}"
            assert response.headers.get("Cache-Control") == "private, no-store"
            result = json.loads(body) if body else None
        checks += 1
        return result

    path = f"/api/users/{ids['public']}"
    update = "/api/users/me/profile"
    assert request("GET", path)["display_name"] is None
    request("PUT", update, {"bio": "Unauthorized"}, viewer=None, expected=401)
    request("PUT", update, {"bio": "Wrong origin"}, origin="https://untrusted.example.invalid", expected=403)
    request("PUT", update, {}, expected=400)
    details = {"display_name": 'Mara & <cărți> "noi"', "pronouns": "ea/ei", "location": "București", "website_url": "HTTPS://EXAMPLE.COM:443/portofoliu?a=1&b=2"}
    request("PUT", update, {"username": "Profile fixture", "bio": "Profil editat", "profile_details": details})
    profile = request("GET", path, viewer=None)
    assert profile["username"] == "Profile fixture" and profile["bio"] == "Profil editat"
    assert profile["display_name"] == details["display_name"]
    assert profile["website_url"] == "https://example.com/portofoliu?a=1&b=2"
    request("PUT", update, {"bio": "Payload vechi"})
    assert request("GET", path)["display_name"] == details["display_name"]
    for key, maximum in [("display_name", 50), ("pronouns", 30), ("location", 80)]:
        request("PUT", update, {"profile_details": {key: "📚"*maximum}})
        assert request("GET", path)[key] == "📚"*maximum
        request("PUT", update, {"bio": "Must not persist", "profile_details": {key: "📚"*(maximum+1)}}, expected=400)
        assert request("GET", path)["bio"] == "Payload vechi"
        request("PUT", update, {"profile_details": {key: "Hidden\nvalue"}}, expected=400)
    for website in ["javascript:alert(1)", "data:text/html,x", "//example.com", "https:example.com", "http://example.com", "https://user:pass@example.com", "https://example.com@evil.com", "https://127.0.0.1", "https://0x7f000001", "https://[::1]", "https://localhost.", "https://app.internal", "https://example.com:8443", "https://example.com/a b", "https://example.com\\@evil.com", "\thttps://example.com", "https://example.com/" + "a"*512]:
        request("PUT", update, {"bio": "Rejected URL", "profile_details": {"website_url": website}}, expected=400)
    request("PUT", update, {"profile_details": {"user_id": ids["follower"]}}, expected=422)
    request("PUT", update, {"username": "follower", "profile_details": details}, expected=409)
    assert request("GET", path)["bio"] == "Payload vechi"
    assert request("GET", f"/api/users/{ids['follower']}")["display_name"] is None
    request("PUT", update, {"profile_details": details})
    request("PUT", "/api/users/me/privacy", {"is_private": True})
    profile = request("GET", path, viewer=None)
    assert profile["display_name"] == details["display_name"] and profile["can_view_content"] is False
    request("GET", path+"/posts", viewer=None, expected=403)
    with urllib.request.urlopen(base+f"/profile/{ids['public']}", timeout=10) as response:
        rendered = response.read().decode()
        assert html.escape(details["display_name"], quote=True) in rendered
        assert "rel=\"noopener noreferrer nofollow ugc\"" in rendered
        assert "<cărți>" not in rendered
    checks += 1
    request("PUT", "/api/users/me/privacy", {"is_private": False})
    sql(f"INSERT INTO user_blocks (blocker_id,blocked_id) VALUES ('{ids['public']}','{ids['follower']}')", database)
    request("GET", path, viewer="follower", expected=404)
    sql(f"DELETE FROM user_blocks WHERE blocker_id='{ids['public']}' AND blocked_id='{ids['follower']}'", database)
    request("PUT", update, {"profile_details": {"display_name": "  ", "pronouns": "", "location": None, "website_url": ""}})
    profile = request("GET", path)
    assert all(profile[key] is None for key in details)
    assert sql(f"SELECT COUNT(*) FROM profile_details WHERE user_id='{ids['public']}'", database) == "0"
    request("PUT", update, {"profile_details": details})
    exported = request("POST", "/api/users/me/export", {"password": "Export fixture password 2026!"})
    assert exported["format_version"] == 12
    assert exported["profile"]["display_name"] == details["display_name"]
    assert exported["profile"]["location"] == details["location"]
    compatibility = os.environ.get("MEDIA_COMPATIBILITY_BINARY")
    if compatibility:
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0)); port = listener.getsockname()[1]
        old_base = f"http://127.0.0.1:{port}"
        old = subprocess.Popen([compatibility], cwd=root, env={**environment, "SERVER_PORT": str(port)}, stdout=log, stderr=log)
        try:
            for _ in range(100):
                try:
                    with urllib.request.urlopen(old_base+"/api/health/ready", timeout=1) as response:
                        if response.status == 200: break
                except (OSError, urllib.error.URLError): time.sleep(0.1)
            else: raise AssertionError("Prior API did not start on profile schema")
            assert request("GET", path, target_base=old_base)["id"] == ids["public"]
            assert request("GET", path)["display_name"] == details["display_name"]
            print("profile_rollback_compatibility=passed; prior binary startup/profile reads; public details retained")
        finally:
            old.terminate(); old.wait(timeout=15)
    print(f"profile_detail_checks={checks}; passed; atomic edits, Unicode, URL/ownership/origin validation, legacy payloads, public/private policy, escaping and export")
