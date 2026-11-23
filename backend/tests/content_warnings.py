"""Advisory labels and audience regressions in the disposable HTTP harness."""
import html
import json
import os
import socket
import subprocess
import time
import urllib.error
import urllib.request


def check_content_warnings(base, ids, tokens, sql, database, environment, root, log):
    checks = 0

    def request(method, path, payload=None, viewer="public", expected=200, target_base=None):
        nonlocal checks
        headers = {"Origin": "http://127.0.0.1:3005"}
        if viewer: headers["Cookie"] = f"media_session={tokens[viewer]}"
        if payload is not None: headers["Content-Type"] = "application/json"
        req = urllib.request.Request((target_base or base)+path, method=method, headers=headers,
                                     data=json.dumps(payload).encode() if payload is not None else None)
        try: response = urllib.request.urlopen(req, timeout=10)
        except urllib.error.HTTPError as error: response = error
        with response:
            body = response.read()
            assert response.status == expected, f"warning {method} {path}: {response.status} != {expected}"
            assert response.headers.get("Cache-Control") == "private, no-store"
            result = json.loads(body) if body else None
        checks += 1
        return result

    for warning in ["📚"*101, "Bad\nlabel", "\tHidden", "Bad\u0000", "Bad\u0085"]:
        request("POST", "/api/posts", {"content": "Invalid warning", "content_warning": warning}, expected=400)
    request("POST", "/api/posts", {"content": "Invalid type", "content_warning": 1}, expected=422)
    request("POST", "/api/posts", {"content": "Unauthorized", "content_warning": "Spoilere"}, viewer=None, expected=401)
    label = "Spoilere & <detalii>"
    created = request("POST", "/api/posts", {"content": "Warning fixture body", "content_warning": "  "+label+"  "})
    assert created["content_warning"] == label
    post_id = created["id"]; path = "/api/posts/"+post_id
    request("PUT", path, {"content": "Foreign edit", "content_warning": "Changed"}, viewer="follower", expected=403)
    request("GET", path, viewer="outsider", expected=404)
    assert request("GET", path, viewer=None)["content_warning"] == label
    request("POST", path+"/save", viewer="follower")
    sql(f"INSERT INTO follows (follower_id,followed_id) VALUES ('{ids['follower']}','{ids['public']}')", database)
    for endpoint in ["/api/posts?limit=50", "/api/saved-posts?limit=50", "/api/feed/following?limit=50", f"/api/users/{ids['public']}/posts", "/api/search?q=Warning"]:
        data = request("GET", endpoint, viewer="follower")
        rows = data["posts"] if isinstance(data, dict) else data
        assert next(row for row in rows if row["id"] == post_id)["content_warning"] == label
    request("PUT", path+"/pin")
    assert request("GET", f"/api/users/{ids['public']}/pinned-post", viewer=None)["content_warning"] == label
    request("DELETE", path+"/pin")
    assert request("PUT", path, {"content": "Warning fixture body"})["content_warning"] == label
    assert request("PUT", path, {"content": "Warning fixture body", "content_warning": None})["content_warning"] == label
    assert request("PUT", path, {"content": "Warning fixture body", "content_warning": ""})["content_warning"] is None
    maximum = "📚"*100
    assert request("PUT", path, {"content": "Warning fixture body", "content_warning": maximum})["content_warning"] == maximum
    request("PUT", path, {"content": "Must not persist", "content_warning": maximum+"📚"}, expected=400)
    assert request("GET", path)["content"] == "Warning fixture body"
    request("PUT", "/api/users/me/privacy", {"is_private": True})
    request("GET", path, viewer=None, expected=404)
    assert request("GET", path, viewer="follower")["content_warning"] == maximum
    sql(f"DELETE FROM follows WHERE follower_id='{ids['follower']}' AND followed_id='{ids['public']}'", database)
    request("GET", path, viewer="follower", expected=404)
    request("PUT", "/api/users/me/privacy", {"is_private": False})
    request("PUT", path+"/hide", viewer="follower")
    request("GET", path, viewer="follower", expected=404)
    request("DELETE", path+"/hide", viewer="follower")
    request("PUT", path, {"content": "Warning fixture body", "content_warning": label})
    # Real public HTML uses native details, but exposes only the advisory in
    # declared metadata. The image URL/description must not enter the preview.
    image_id, image_url = sql(f"SELECT id,image_url FROM posts WHERE user_id='{ids['public']}' AND image_url IS NOT NULL LIMIT 1", database).split("\t")
    request("PUT", "/api/posts/"+image_id, {"content": "Sensitive body metadata marker", "image_url": image_url, "image_alt": "Sensitive image metadata marker", "content_warning": label})
    with urllib.request.urlopen(base+"/post/"+image_id, timeout=10) as response:
        rendered = response.read().decode()
        head, _, body = rendered.partition("<!--media-app-root-start-->")
        assert "Sensitive body metadata marker" not in head
        assert "Sensitive image metadata marker" not in head
        assert image_url not in head
        assert "<details class=\"post-warning\"><summary>Avertisment: "+html.escape(label, quote=True) in body
        assert "Sensitive body metadata marker" in body
    checks += 1
    exported = request("POST", "/api/users/me/export", {"password": "Export fixture password 2026!"})
    assert exported["format_version"] == 12
    assert next(row for row in exported["posts"] if row["id"] == post_id)["content_warning"] == label
    invalid = subprocess.run(["mariadb", database], input=f"UPDATE posts SET content_warning='' WHERE id='{post_id}'", text=True, capture_output=True)
    assert invalid.returncode != 0, "blank warning escaped database check"
    compatibility = os.environ.get("MEDIA_COMPATIBILITY_BINARY")
    if compatibility:
        with socket.socket() as listener:
            listener.bind(("127.0.0.1",0)); port = listener.getsockname()[1]
        old_base = f"http://127.0.0.1:{port}"
        old = subprocess.Popen([compatibility], cwd=root, env={**environment,"SERVER_PORT":str(port)}, stdout=log, stderr=log)
        try:
            for _ in range(100):
                try:
                    with urllib.request.urlopen(old_base+"/api/health/ready", timeout=1) as response:
                        if response.status == 200: break
                except (OSError,urllib.error.URLError): time.sleep(.1)
            else: raise AssertionError("Pre-warning API did not start")
            assert "content_warning" not in request("GET", path, target_base=old_base)
            request("PUT", path, {"content": "Warning fixture legacy edit"}, target_base=old_base)
            assert request("GET", path)["content_warning"] == label
            print("warning_storage_compatibility=passed; old binary preserves column; old readers do not implement disclosure/preview behavior")
        finally:
            old.terminate(); old.wait(timeout=15)
    request("DELETE", path)
    assert sql(f"SELECT COUNT(*) FROM posts WHERE id='{post_id}'",database) == "0"
    print(f"content_warning_checks={checks}; passed; validation, all post DTOs, ownership, private/hide audiences, legacy payloads, metadata escaping and export")
