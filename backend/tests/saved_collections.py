"""Actual HTTP and MariaDB collection tests inside the disposable harness."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
import socket
import subprocess
import time
import urllib.error
import urllib.request
import uuid


def check_saved_collections(base, ids, tokens, sql, database, environment, root, log):
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
            if expected is not None:
                assert response.status == expected, f"collection {method} {path}: {response.status} != {expected}"
            assert response.headers.get("Cache-Control") == "private, no-store"
            result = json.loads(body) if body else None
            status = response.status
        checks += 1
        return (status, result) if expected is None else result

    folders = "/api/saved-collections"
    folder_path = lambda folder: folders + "/" + folder
    assignment_path = lambda post: f"/api/saved-posts/{post}/collection"
    listing = lambda folder=None, viewer="public": request("GET", "/api/saved-posts?limit=50" + ("&collection_id=" + folder if folder else ""), viewer=viewer)
    create = lambda name: request("POST", folders, {"name": name})["id"]
    assign = lambda post, folder: request("PUT", assignment_path(post), {"collection_id": folder})

    request("GET", folders, viewer=None, expected=401)
    request("POST", folders, {"name": "Unauthorized"}, viewer=None, expected=401)
    request("POST", folders, {"name": "Wrong origin"}, origin="https://untrusted.example.invalid", expected=403)
    assert request("GET", folders) == []
    for name in ["", "　 ", "📚" * 61, "\tHidden", "One\nTwo", "Bad\u0000", "Bad\u0085"]:
        request("POST", folders, {"name": name}, expected=400)
    request("POST", folders, {}, expected=422)
    first = create("  Lecturi  ")
    assert request("GET", folders)[0]["name"] == "Lecturi"
    request("POST", folders, {"name": "lecturi"}, expected=409)
    second = create("📚" * 60)
    renamed = request("PUT", folder_path(second.upper()), {"name": 'Idei & <proiecte> "personale"'})
    assert renamed["name"] == 'Idei & <proiecte> "personale"'
    request("PUT", folder_path(second), {"name": "Lecturi"}, expected=409)
    request("PUT", folder_path(first), {"name": "Invalid\nname"}, expected=400)
    request("PUT", folder_path(first), {"name": "Foreign rename"}, viewer="follower", expected=404)
    request("DELETE", folder_path(first), viewer="follower", expected=404)
    request("DELETE", folder_path(first), origin="https://untrusted.example.invalid", expected=403)
    request("DELETE", folder_path("bad-id"), expected=404)
    request("DELETE", folder_path(str(uuid.uuid4())), expected=404)
    foreign = request("POST", folders, {"name": "Private foreign collection"}, viewer="follower")["id"]
    assert len(request("GET", folders)) == 2
    assert len(request("GET", folders, viewer="follower")) == 1
    request("GET", f"/api/saved-posts?collection_id={foreign}", expected=404)
    request("GET", f"/api/saved-posts?collection_id={first}", viewer="follower", expected=404)
    for suffix in ["collection_id=", "collection_id=not-a-uuid", "collection_id=unfiled&limit=51", "collection_id=unfiled&offset=-1"]:
        request("GET", "/api/saved-posts?" + suffix, expected=400)

    a, b, unsaved = [request("POST", "/api/posts", {"content": "Collection fixture " + letter})["id"] for letter in ["A", "B", "Unsaved"]]
    c = request("POST", "/api/posts", {"content": "Audience fixture"}, viewer="follower")["id"]
    for post in [a, b, c]:
        assert request("POST", f"/api/posts/{post}/save")["saved"] is True
    request("PUT", assignment_path(a), {"collection_id": first}, viewer=None, expected=401)
    request("PUT", assignment_path(a), {"collection_id": first}, viewer="follower", expected=404)
    request("PUT", assignment_path(a), {"collection_id": foreign}, expected=404)
    request("PUT", assignment_path(a), {"collection_id": "bad-id"}, expected=400)
    request("PUT", assignment_path(a), {"collection_id": 5}, expected=400)
    request("PUT", assignment_path(a), {}, expected=422)
    request("PUT", assignment_path(unsaved), {"collection_id": first}, expected=404)
    request("PUT", assignment_path(a), {"collection_id": first}, origin="https://untrusted.example.invalid", expected=403)
    assert assign(a.upper(), first.upper())["collection_id"] == first
    stamp = sql(f"SELECT assigned_at FROM saved_collection_posts WHERE user_id='{ids['public']}' AND post_id='{a}'", database)
    assert assign(a, first)["collection_id"] == first
    assert sql(f"SELECT assigned_at FROM saved_collection_posts WHERE user_id='{ids['public']}' AND post_id='{a}'", database) == stamp
    assert [row["id"] for row in listing(first)] == [a]
    assert next(row for row in listing() if row["id"] == a)["collection_id"] == first
    assert a not in [row["id"] for row in listing("unfiled")]
    assert b in [row["id"] for row in listing("unfiled")]
    assert "collection_id" not in request("GET", f"/api/posts/{a}")
    assert "Private foreign collection" not in json.dumps(request("GET", f"/api/users/{ids['public']}", viewer="follower"))
    # Probe each independent composite FK without a conflicting primary key.
    for post, folder in [(b, foreign), (unsaved, first)]:
        invalid = subprocess.run(["mariadb", database], text=True, capture_output=True,
                                 input=f"INSERT INTO saved_collection_posts (user_id,post_id,collection_id) VALUES ('{ids['public']}','{post}','{folder}')")
        assert invalid.returncode != 0 and "1452" in invalid.stderr, "collection FK accepted invalid ownership/reference"
    assign(b, first)
    sql(f"UPDATE saved_posts SET created_at='2026-01-01' WHERE user_id='{ids['public']}' AND post_id IN ('{a}','{b}')", database)
    ordered = [row["id"] for row in listing(first)]
    assert ordered == sorted([a, b], reverse=True)
    assert request("GET", f"/api/saved-posts?collection_id={first}&limit=1&offset=1")[0]["id"] == ordered[1]
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda folder: assign(a, folder), [first, second]))
    assert all(result["collection_id"] in [first, second] for result in results)
    assert sql(f"SELECT COUNT(*) FROM saved_collection_posts WHERE user_id='{ids['public']}' AND post_id='{a}'", database) == "1"
    for _ in range(12):
        with ThreadPoolExecutor(max_workers=2) as executor:
            move = executor.submit(lambda: request("PUT", assignment_path(c), {"collection_id": first}, expected=None))
            unsave = executor.submit(lambda: request("POST", f"/api/posts/{c}/save"))
            assert move.result()[0] in [200, 404]
            assert unsave.result()["saved"] is False
        assert sql(f"SELECT COUNT(*) FROM saved_collection_posts WHERE user_id='{ids['public']}' AND post_id='{c}'", database) == "0"
        request("POST", f"/api/posts/{c}/save")
    disposable = create("Deleted concurrently")
    with ThreadPoolExecutor(max_workers=2) as executor:
        move = executor.submit(lambda: request("PUT", assignment_path(a), {"collection_id": disposable}, expected=None))
        deletion = executor.submit(lambda: request("DELETE", folder_path(disposable)))
        assert move.result()[0] in [200, 404]
        assert deletion.result()["deleted"] is True
    assert sql(f"SELECT COUNT(*) FROM saved_collection_posts WHERE collection_id='{disposable}'", database) == "0"

    # A bookmark remains metadata only; access is rechecked on every list read.
    assign(c, first)
    request("PUT", "/api/users/me/privacy", {"is_private": True}, viewer="follower")
    assert c not in [row["id"] for row in listing(first)]
    sql(f"INSERT INTO follows (follower_id,followed_id) VALUES ('{ids['public']}','{ids['follower']}')", database)
    assert c in [row["id"] for row in listing(first)]
    sql(f"DELETE FROM follows WHERE follower_id='{ids['public']}' AND followed_id='{ids['follower']}'", database)
    assert c not in [row["id"] for row in listing(first)]
    request("PUT", "/api/users/me/privacy", {"is_private": False}, viewer="follower")
    request("PUT", f"/api/users/{ids['follower']}/mute")
    assert c not in [row["id"] for row in listing(first)]
    request("DELETE", f"/api/users/{ids['follower']}/mute")
    request("PUT", f"/api/posts/{c}/hide")
    assert c not in [row["id"] for row in listing(first)]
    request("PUT", assignment_path(c), {"collection_id": second}, expected=404)
    assert sql(f"SELECT COUNT(*) FROM saved_collection_posts WHERE user_id='{ids['public']}' AND post_id='{c}'", database) == "0"
    assert c not in [row["id"] for row in listing(second)]
    request("DELETE", f"/api/posts/{c}/hide")
    request("POST", f"/api/posts/{c}/save")
    assign(c, second)
    assert c in [row["id"] for row in listing(second)]
    for blocker, blocked in [(ids['public'], ids['follower']), (ids['follower'], ids['public'])]:
        sql(f"INSERT INTO user_blocks (blocker_id,blocked_id) VALUES ('{blocker}','{blocked}')", database)
        assert c not in [row["id"] for row in listing(second)]
        sql(f"DELETE FROM user_blocks WHERE blocker_id='{blocker}' AND blocked_id='{blocked}'", database)
    assert assign(a, None)["collection_id"] is None
    assert a in [row["id"] for row in listing("unfiled")]
    assign(a, first)
    before = sql(f"SELECT COUNT(*) FROM saved_posts WHERE user_id='{ids['public']}'", database)
    request("DELETE", folder_path(first))
    assert sql(f"SELECT COUNT(*) FROM saved_posts WHERE user_id='{ids['public']}'", database) == before
    assert not sql(f"SELECT collection_id FROM saved_collection_posts WHERE user_id='{ids['public']}' AND post_id='{a}'", database)
    request("GET", f"/api/saved-posts?collection_id={first}", expected=404)

    compatibility = os.environ.get("MEDIA_COMPATIBILITY_BINARY")
    if compatibility:
        assign(a, second)
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
                raise AssertionError("Prior API did not start on collection schema")
            rows = request("GET", "/api/saved-posts?limit=50", target_base=old_base)
            assert "collection_id" not in next(row for row in rows if row["id"] == a)
            assert request("POST", f"/api/posts/{a}/save", target_base=old_base)["saved"] is False
            assert sql(f"SELECT COUNT(*) FROM saved_collection_posts WHERE user_id='{ids['public']}' AND post_id='{a}'", database) == "0"
            print("collection_rollback_compatibility=passed; prior binary startup, saved reads and unsave cascade")
        finally:
            old.terminate()
            old.wait(timeout=15)
        request("POST", f"/api/posts/{a}/save")
    assign(a, second)
    assert request("POST", f"/api/posts/{a}/save")["saved"] is False
    assert sql(f"SELECT COUNT(*) FROM saved_collection_posts WHERE user_id='{ids['public']}' AND post_id='{a}'", database) == "0"
    request("POST", f"/api/posts/{a}/save")
    assert next(row for row in listing() if row["id"] == a)["collection_id"] is None
    request("DELETE", f"/api/posts/{c}", viewer="follower")
    assert sql(f"SELECT COUNT(*) FROM saved_collection_posts WHERE post_id='{c}'", database) == "0"
    assign(a, second)
    # Concurrent creation at the cap has exactly one successful slot.
    current_count = int(sql(f"SELECT COUNT(*) FROM saved_collections WHERE user_id='{ids['public']}'", database))
    values = ",".join(f"('{uuid.uuid4()}','{ids['public']}','Cap fixture {number}')" for number in range(29-current_count))
    sql("INSERT INTO saved_collections (id,user_id,name) VALUES " + values, database)
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda title: request("POST", folders, {"name": title}, expected=None), ["Final slot A", "Final slot B"]))
    assert sorted(status for status, _ in results) == [200, 409]
    assert len(request("GET", folders)) == 30
    request("POST", folders, {"name": "Over cap"}, expected=409)
    exported = request("POST", "/api/users/me/export", {"password": "Export fixture password 2026!"})
    assert exported["format_version"] == 10
    assert exported["counts"]["saved_collections"] == len(exported["saved_collections"]) == 30
    assert exported["counts"]["saved_collection_posts"] == len(exported["saved_collection_posts"])
    assert {"post_id": a, "collection_id": second} in [{"post_id": row["post_id"], "collection_id": row["collection_id"]} for row in exported["saved_collection_posts"]]
    assert "Private foreign collection" not in json.dumps(exported)
    assert "password_hash" not in json.dumps(exported) and "token_hash" not in json.dumps(exported)
    print(f"saved_collection_checks={checks}; passed; privacy, CRUD, validation, quota races, filters, pagination, FK/cascades and export v10")
