"""Real HTTP/storage pin regression, called only in the disposable harness."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
import socket
import subprocess
import time
import urllib.error
import urllib.request
import uuid


def check_profile_pins(base, ids, tokens, sql, database, environment, root, log):
    checks = 0

    def request(method, path, payload=None, viewer="public", expected=200,
                origin="http://127.0.0.1:3005", target_base=None):
        nonlocal checks
        headers = {"Origin": origin}
        if viewer:
            headers["Cookie"] = f"media_session={tokens[viewer]}"
        if payload is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request((target_base or base) + path, method=method,
                                     data=json.dumps(payload).encode() if payload is not None else None,
                                     headers=headers)
        try:
            response = urllib.request.urlopen(req, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            body = response.read()
            assert response.status == expected, f"pin {method} {path}: {response.status} != {expected}"
            assert response.headers.get("Cache-Control") == "private, no-store"
            result = json.loads(body) if body else None
        checks += 1
        return result

    profile_path = f"/api/users/{ids['public']}/pinned-post"
    assert request("GET", profile_path, viewer=None) is None
    request("GET", "/api/users/not-a-uuid/pinned-post", viewer=None, expected=404)
    request("GET", f"/api/users/{uuid.uuid4()}/pinned-post", expected=404)
    a, b = [request("POST", "/api/posts", {"content": "Pin fixture " + letter})["id"] for letter in ["A", "B"]]
    pin_path = lambda post_id: f"/api/posts/{post_id}/pin"
    request("PUT", pin_path(a), viewer=None, expected=401)
    request("PUT", pin_path(a), viewer="follower", expected=403)
    request("DELETE", pin_path(a), viewer="follower", expected=403)
    request("PUT", pin_path(a), origin="https://untrusted.example.invalid", expected=403)
    request("DELETE", pin_path(a), origin="https://untrusted.example.invalid", expected=403)
    request("PUT", pin_path(str(uuid.uuid4())), expected=404)
    request("PUT", pin_path("bad-id"), expected=404)
    assert request("PUT", pin_path(a))["pinned_post_id"] == a
    stamp = sql(f"SELECT pinned_at FROM profile_pins WHERE user_id='{ids['public']}'", database)
    time.sleep(0.01)
    assert request("PUT", pin_path(a))["pinned_post_id"] == a
    assert sql(f"SELECT pinned_at FROM profile_pins WHERE user_id='{ids['public']}'", database) == stamp
    assert request("GET", profile_path, viewer=None)["id"] == a
    assert request("GET", f"/api/users/{ids['public'].upper()}/pinned-post", viewer=None)["id"] == a
    assert request("PUT", pin_path(a.upper()))["pinned_post_id"] == a
    assert request("GET", f"/api/posts/{a}")["is_pinned"] is True
    assert request("GET", f"/api/posts/{b}")["is_pinned"] is False
    request("POST", f"/api/posts/{a}/save", viewer="follower")
    sql(f"INSERT INTO follows (follower_id,followed_id) VALUES ('{ids['follower']}','{ids['public']}')", database)
    # All full-post DTO paths include the flag, without altering feed ordering.
    sql(f"UPDATE posts SET created_at='2020-01-01' WHERE id='{a}'", database)
    for path in ["/api/posts?limit=50", "/api/feed/following?limit=50", "/api/saved-posts?limit=50",
                 f"/api/users/{ids['public']}/posts", "/api/search?q=Pin%20fixture"]:
        data = request("GET", path, viewer="follower")
        rows = data["posts"] if isinstance(data, dict) else data
        assert next(row for row in rows if row["id"] == a)["is_pinned"] is True
        if path.startswith(("/api/posts?", "/api/feed/", "/api/users/")):
            positions = [row["id"] for row in rows]
            assert positions.index(b) < positions.index(a)
    assert request("PUT", pin_path(b))["pinned_post_id"] == b
    assert request("DELETE", pin_path(a))["pinned_post_id"] == b
    assert request("GET", profile_path, viewer=None)["id"] == b
    assert sql(f"SELECT COUNT(*) FROM profile_pins WHERE user_id='{ids['public']}'", database) == "1"
    assert request("DELETE", pin_path(b))["pinned_post_id"] is None
    assert request("DELETE", pin_path(b))["pinned_post_id"] is None
    assert request("GET", profile_path, viewer=None) is None
    request("PUT", pin_path(a))
    # A database invariant rejects cross-owner rows even outside the API.
    invalid = subprocess.run(["mariadb", database],
                             input=f"INSERT INTO profile_pins (user_id,post_id) VALUES ('{ids['follower']}','{a}')",
                             text=True, capture_output=True)
    assert invalid.returncode != 0
    assert sql(f"SELECT COUNT(*) FROM profile_pins WHERE user_id='{ids['follower']}'", database) == "0"
    follower_post = request("POST", "/api/posts", {"content": "Independent profile"}, viewer="follower")["id"]
    request("PUT", pin_path(follower_post), viewer="follower")
    assert request("GET", profile_path)["id"] == a
    assert request("GET", f"/api/users/{ids['follower']}/pinned-post")["id"] == follower_post

    request("PUT", "/api/users/me/privacy", {"is_private": True})
    request("GET", profile_path, viewer=None, expected=403)
    assert request("GET", profile_path, viewer="follower")["id"] == a
    assert request("GET", profile_path)["id"] == a
    sql(f"DELETE FROM follows WHERE follower_id='{ids['follower']}' AND followed_id='{ids['public']}'", database)
    request("GET", profile_path, viewer="follower", expected=403)
    request("DELETE", pin_path(a))
    request("GET", profile_path, viewer=None, expected=403)
    request("PUT", pin_path(a))
    request("PUT", "/api/users/me/privacy", {"is_private": False})
    # Existing outsider -> author block; reverse direction conceals the profile.
    assert request("GET", profile_path, viewer="outsider") is None
    sql(f"DELETE FROM user_blocks; INSERT INTO user_blocks (blocker_id,blocked_id) VALUES ('{ids['public']}','{ids['outsider']}')", database)
    request("GET", profile_path, viewer="outsider", expected=404)
    request("PUT", f"/api/posts/{a}/hide", viewer="follower")
    assert request("GET", profile_path, viewer="follower") is None
    request("DELETE", f"/api/posts/{a}/hide", viewer="follower")
    request("PUT", f"/api/users/{ids['public']}/mute", viewer="follower")
    assert request("GET", profile_path, viewer="follower")["id"] == a
    request("DELETE", f"/api/users/{ids['public']}/mute", viewer="follower")

    # The featured post is fetched independently of the first 50 profile rows.
    values = ",".join(f"('{uuid.uuid4()}','{ids['public']}','Recent fixture','2026-01-01')" for _ in range(52))
    sql("INSERT INTO posts (id,user_id,content,created_at) VALUES " + values, database)
    assert a not in [row["id"] for row in request("GET", f"/api/users/{ids['public']}/posts")]
    assert request("GET", profile_path, viewer=None)["id"] == a
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda post: request("PUT", pin_path(post)), [a, b]))
    assert all(result["pinned_post_id"] in [a, b] for result in results)
    current = sql(f"SELECT post_id FROM profile_pins WHERE user_id='{ids['public']}'", database)
    assert request("GET", profile_path)["id"] == current
    stale = b if current == a else a
    assert request("DELETE", pin_path(stale))["pinned_post_id"] == current
    exported = request("POST", "/api/users/me/export", {"password": "Export fixture password 2026!"})
    assert exported["format_version"] == 12
    assert exported["profile"]["pinned_post_id"] == current
    assert exported["profile"]["pinned_post_at"] is not None
    assert "password_hash" not in json.dumps(exported) and "token_hash" not in json.dumps(exported)

    compatibility = os.environ.get("MEDIA_COMPATIBILITY_BINARY")
    if compatibility:
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        old_base = f"http://127.0.0.1:{port}"
        old = subprocess.Popen([compatibility], cwd=root, env={**environment, "SERVER_PORT": str(port)}, stdout=log, stderr=log)
        try:
            for _ in range(100):
                try:
                    with urllib.request.urlopen(old_base + "/api/health/ready", timeout=1) as response:
                        if response.status == 200:
                            break
                except (OSError, urllib.error.URLError):
                    time.sleep(0.1)
            else:
                raise AssertionError("Prior API did not start on pin schema")
            request("DELETE", f"/api/posts/{current}", target_base=old_base)
            assert request("GET", profile_path) is None
            print("pin_rollback_compatibility=passed; preceding production binary startup and delete cascade")
        finally:
            old.terminate()
            old.wait(timeout=15)
    request("DELETE", f"/api/posts/{follower_post}", viewer="follower")
    assert request("GET", f"/api/users/{ids['follower']}/pinned-post") is None
    # Account deletion must cascade both the post and its pin.
    request("PUT", pin_path(stale))
    request("DELETE", "/api/users/me", {"password": "Export fixture password 2026!", "confirmation": "STERGE CONTUL"})
    assert sql(f"SELECT COUNT(*) FROM profile_pins WHERE user_id='{ids['public']}'", database) == "0"
    request("GET", profile_path, viewer=None, expected=404)
    print(f"profile_pin_checks={checks}; passed; ownership, origins, audiences, hides, concurrency, paging, export and cascade")
