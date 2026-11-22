#!/usr/bin/env python3
"""Disposable MariaDB + HTTP media authorization regression.

Run as a MariaDB socket administrator after cargo build --release --locked.
Only randomly named test databases/users and a temporary upload tree are touched.
No production environment file, credentials, accounts or upload paths are used.
"""
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid


def main():
    binary = Path(__file__).resolve().parents[1] / "target/release/social-media-backend"
    if not binary.is_file():
        raise SystemExit("Build the release backend first")
    suffix = secrets.token_hex(6)
    database = f"media_test_{suffix}"
    db_user = f"media_test_{suffix}"
    db_password = secrets.token_hex(24)
    process = None
    created_database = created_user = False

    def sql(statement, selected_database=None):
        command = ["mariadb", "--batch", "--skip-column-names"]
        if selected_database:
            command.append(selected_database)
        result = subprocess.run(command, input=statement, text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError("Disposable database operation failed")
        return result.stdout.strip()

    try:
        sql(f"CREATE DATABASE `{database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        created_database = True
        sql(f"CREATE USER '{db_user}'@'127.0.0.1' IDENTIFIED BY '{db_password}'")
        created_user = True
        sql(f"GRANT ALL ON `{database}`.* TO '{db_user}'@'127.0.0.1'")
        with tempfile.TemporaryDirectory(prefix="media-access-") as directory:
            root = Path(directory)
            for name in ("posts", "avatars", "private"):
                (root / "uploads" / name).mkdir(parents=True)
            private_path = "/uploads/posts/post_private.webp"
            public_path = "/uploads/posts/post_public.webp"
            for path in (private_path, public_path, "/uploads/posts/post_pending.webp", "/uploads/avatars/avatar.webp", "/uploads/private/secret.webp"):
                (root / path.lstrip("/")).write_bytes(b"media-authorization-test-fixture")
            with socket.socket() as listener:
                listener.bind(("127.0.0.1", 0))
                port = listener.getsockname()[1]
            environment = {
                "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                "DATABASE_URL": f"mysql://{db_user}:{db_password}@127.0.0.1/{database}",
                "ENVIRONMENT": "test", "SERVER_HOST": "127.0.0.1", "SERVER_PORT": str(port),
                "CORS_ORIGIN": "http://127.0.0.1:3005", "APP_URL_LOCAL": "http://127.0.0.1:3005",
                "SMTP_SERVER": "smtp.example.invalid", "SMTP_USERNAME": "fixture", "SMTP_PASSWORD": "fixture",
                "FROM_EMAIL": "fixture@example.invalid", "UPLOAD_MAINTENANCE_ENABLED": "false",
            }
            import shutil
            shell = root / "frontend-shell.html"
            shutil.copyfile(Path(__file__).resolve().parents[2] / "frontend/dist/index.html", shell)
            environment["FRONTEND_SHELL_PATH"] = str(shell)
            migration_binary = binary.with_name("migrate")
            manifest = subprocess.run([str(migration_binary), "manifest"], capture_output=True, text=True, check=True)
            assert json.loads(manifest.stdout), "empty migration manifest"
            for expected_database in [database, database]:
                result = subprocess.run([str(migration_binary), "apply", expected_database], cwd=root, env=environment, capture_output=True, text=True)
                assert result.returncode == 0, "isolated migration application failed"
            mismatch = subprocess.run([str(migration_binary), "apply", "different_expected_database"], cwd=root, env=environment, capture_output=True, text=True)
            assert mismatch.returncode != 0, "migration target mismatch accepted"
            print("offline_migration_checks=passed; manifest, application, idempotence, target mismatch")
            if os.environ.get("MEDIA_TEST_MIGRATION_RUNNER") == "true":
                # This is a disposable database only. Simulate one pending
                # migration so the complete production runner can be exercised.
                entries = json.loads(manifest.stdout)
                latest = entries[-1]["version"]
                if latest == 20261030000000:
                    sql(f"DROP TABLE notification_preferences; DELETE FROM _sqlx_migrations WHERE version={latest}", database)
                elif latest == 20261122000000:
                    sql(f"DROP TRIGGER posts_image_alt_cleanup; ALTER TABLE posts DROP CONSTRAINT chk_posts_image_alt, DROP COLUMN image_alt; DELETE FROM _sqlx_migrations WHERE version={latest}", database)
                else:
                    raise AssertionError("Update runner fixture for the current last migration")
                fixture_environment = root / "migration.env"
                fixture_environment.write_text("DATABASE_URL=" + environment["DATABASE_URL"] + "\n")
                fixture_environment.chmod(0o600)
                import datetime
                stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
                release = stamp + "-" + secrets.token_hex(4)
                runner = Path(__file__).resolve().parents[2] / "deploy/scripts/apply-migrations.py"
                runner_environment = {**os.environ, "MEDIA_DATABASE_NAME": database, "MEDIA_MIGRATION_ENV_FILE": str(fixture_environment)}
                for flags in [["--dry-run"], []]:
                    result = subprocess.run([str(runner), *flags, release], env=runner_environment, capture_output=True, text=True)
                    assert result.returncode == 0, "backup-verified migration runner failed: " + result.stderr
                print("migration_runner_checks=passed; backup, isolated restore, sandboxed application, manifest parity")
            with tempfile.TemporaryFile() as log:
                process = subprocess.Popen([str(binary)], cwd=root, env=environment, stdout=log, stderr=log)
                base = f"http://127.0.0.1:{port}"
                for _ in range(100):
                    if process.poll() is not None:
                        raise RuntimeError("Disposable backend exited during startup")
                    try:
                        with urllib.request.urlopen(base + "/api/health/ready", timeout=1) as response:
                            if response.status == 200:
                                break
                    except (OSError, urllib.error.URLError):
                        time.sleep(0.1)
                else:
                    raise RuntimeError("Disposable backend readiness timed out")

                ids = {name: str(uuid.uuid4()) for name in ("private", "public", "follower", "outsider")}
                tokens = {name: secrets.token_hex(24) for name in ids}
                for name, user_id in ids.items():
                    token_hash = hashlib.sha256(tokens[name].encode()).hexdigest()
                    sql(f"INSERT INTO users (id,username,email,password_hash,is_private) VALUES ('{user_id}','{name}','{name}@example.invalid','disabled-fixture',{int(name == 'private')});"
                        f"INSERT INTO sessions (id,user_id,token_hash,expires_at) VALUES ('{uuid.uuid4()}','{user_id}','{token_hash}',DATE_ADD(NOW(),INTERVAL 1 DAY));", database)
                for name, path in (("private", private_path), ("public", public_path)):
                    sql(f"INSERT INTO posts (id,user_id,content,image_url) VALUES ('{uuid.uuid4()}','{ids[name]}','fixture','{path}')", database)
                sql(f"INSERT INTO follows (follower_id,followed_id) VALUES ('{ids['follower']}','{ids['private']}')", database)
                checks = 0

                def require(label, path, expected, viewer=None, method="GET", headers=None):
                    nonlocal checks
                    request_headers = dict(headers or {})
                    if viewer:
                        request_headers["Cookie"] = f"media_session={tokens[viewer]}"
                    request = urllib.request.Request(base + path, method=method, headers=request_headers)
                    try:
                        response = urllib.request.urlopen(request, timeout=5)
                    except urllib.error.HTTPError as error:
                        response = error
                    with response:
                        body = response.read()
                        assert response.status == expected, f"{label}: {response.status} != {expected}"
                        assert response.headers.get("Cache-Control") == "private, no-store", label
                        assert response.headers.get("X-Content-Type-Options") == "nosniff", label
                        if expected == 200 and method == "GET":
                            assert body == b"media-authorization-test-fixture", label
                        elif expected != 200:
                            assert b"media-authorization-test-fixture" not in body, label
                        if method == "HEAD":
                            assert body == b"", label
                    checks += 1

                require("anonymous private", private_path, 403)
                require("private HEAD", private_path, 403, method="HEAD")
                require("private owner", private_path, 200, "private")
                require("private outsider", private_path, 403, "outsider")
                require("approved follower", private_path, 200, "follower")
                require("spoofed probe path", private_path, 403, headers={"X-Media-Path": public_path})
                require("Range cannot bypass", private_path, 403, headers={"Range": "bytes=0-3"})
                require("conditional cannot bypass", private_path, 403, headers={"If-Modified-Since": "Wed, 01 Jan 2031 00:00:00 GMT"})
                require("public anonymous", public_path, 200)
                require("pending image", "/uploads/posts/post_pending.webp", 403, "private")
                require("unknown namespace", "/uploads/private/secret.webp", 404)
                require("encoded traversal", "/uploads/posts/%2e%2e/avatars/avatar.webp", 404)
                require("public avatar", "/uploads/avatars/avatar.webp", 200)
                require("write denied", public_path, 405, method="POST")
                sql(f"DELETE FROM follows WHERE follower_id='{ids['follower']}' AND followed_id='{ids['private']}'", database)
                require("removed follower", private_path, 403, "follower")
                sql(f"INSERT INTO user_blocks (blocker_id,blocked_id) VALUES ('{ids['public']}','{ids['outsider']}')", database)
                require("blocked viewer", public_path, 403, "outsider")
                sql(f"DELETE FROM user_blocks; INSERT INTO user_blocks (blocker_id,blocked_id) VALUES ('{ids['outsider']}','{ids['public']}')", database)
                require("viewer blocks author", public_path, 403, "outsider")
                sql(f"UPDATE users SET is_private=0 WHERE id='{ids['private']}'", database)
                require("made public", private_path, 200)
                sql(f"UPDATE users SET is_private=1 WHERE id='{ids['private']}'", database)
                require("made private again", private_path, 403)
                print(f"media_access_checks={checks}; passed; isolated database and uploads")

                identity_checks = 0

                def identity_request(path, payload=None, cookie=None, expected=200):
                    nonlocal identity_checks
                    headers = {"Origin": "http://127.0.0.1:3005"}
                    if cookie:
                        headers["Cookie"] = cookie
                    data = None
                    if payload is not None:
                        headers["Content-Type"] = "application/json"
                        data = json.dumps(payload).encode()
                    request = urllib.request.Request(base + path, data=data, headers=headers)
                    try:
                        response = urllib.request.urlopen(request, timeout=10)
                    except urllib.error.HTTPError as error:
                        response = error
                    with response:
                        response.read()
                        if expected is not None:
                            assert response.status == expected, f"{path}: {response.status} != {expected}"
                        cookie_value = response.headers.get("Set-Cookie", "").split(";")[0]
                        status = response.status
                    identity_checks += 1
                    return status, cookie_value

                # Exercise the browser/API Unicode contract against actual
                # storage, without sending email or touching production data.
                publishing_cookie = f"media_session={tokens['public']}"
                identity_request("/api/posts", {"content": "📷" * 500}, publishing_cookie)
                assert sql(f"SELECT CHAR_LENGTH(content) FROM posts WHERE user_id='{ids['public']}' AND image_url IS NULL", database) == "500"
                identity_request("/api/posts", {"content": "📷" * 501}, publishing_cookie, expected=400)
                identity_request("/api/posts", {"content": "hidden\u0000control"}, publishing_cookie, expected=400)
                print(f"publishing_checks={identity_checks}; passed; 500 emoji persisted, oversized/control payloads rejected")
                identity_checks = 0

                def account_token(kind, expired=False):
                    raw = secrets.token_hex(24)
                    stored = hashlib.sha256(raw.encode()).hexdigest()
                    if kind == "email_change":
                        stored += ":updated@example.invalid"
                    expiry = "DATE_SUB(NOW(),INTERVAL 1 HOUR)" if expired else "DATE_ADD(NOW(),INTERVAL 1 HOUR)"
                    sql(f"INSERT INTO email_tokens (id,user_id,token,token_type,expires_at) VALUES ('{uuid.uuid4()}','{ids['private']}','{stored}','{kind}',{expiry})", database)
                    return raw

                def assert_no_credential_tokens():
                    assert sql(f"SELECT COUNT(*) FROM email_tokens WHERE user_id='{ids['private']}' AND token_type IN ('password_reset','email_change')", database) == "0"

                expired = account_token("password_reset", expired=True)
                identity_request("/api/auth/reset-password", {"token": expired, "password": "A fresh account password 2026!"}, expected=410)
                first, second = account_token("password_reset"), account_token("password_reset")
                account_token("email_change")
                identity_request("/api/auth/reset-password", {"token": first, "password": "A fresh account password 2026!"})
                assert_no_credential_tokens()
                identity_request("/api/auth/reset-password", {"token": second, "password": "Another fresh password 2026!"}, expected=404)
                identity_request("/api/auth/me", cookie=f"media_session={tokens['private']}", expected=401)
                _, login_cookie = identity_request("/api/auth/login", {"email": "private@example.invalid", "password": "A fresh account password 2026!"})
                account_token("password_reset")
                account_token("email_change")
                _, changed_cookie = identity_request("/api/users/me/change-password", {"old_password": "A fresh account password 2026!", "new_password": "A changed account password 2026!"}, login_cookie)
                assert_no_credential_tokens()
                identity_request("/api/auth/me", cookie=login_cookie, expected=401)
                identity_request("/api/auth/me", cookie=changed_cookie)
                old_address_reset = account_token("password_reset")
                change = account_token("email_change")
                identity_request("/api/users/verify-email-change", {"token": change})
                assert_no_credential_tokens()
                identity_request("/api/auth/reset-password", {"token": old_address_reset, "password": "Old address attack password 2026!"}, expected=404)
                identity_request("/api/auth/me", cookie=changed_cookie, expected=401)
                assert sql(f"SELECT email FROM users WHERE id='{ids['private']}'", database) == "updated@example.invalid"
                race_tokens = [account_token("password_reset"), account_token("password_reset")]
                with ThreadPoolExecutor(max_workers=2) as executor:
                    attempts = list(executor.map(lambda token: identity_request("/api/auth/reset-password", {"token": token, "password": "Concurrent reset password 2026!"}, expected=None)[0], race_tokens))
                assert sorted(attempts) == [200, 404], f"Concurrent reset statuses: {attempts}"
                assert_no_credential_tokens()
                print(f"identity_checks={identity_checks}; passed; credential links revoked, sessions rotated, concurrent reset single winner")
                alt_checks = 0

                def alt_request(method, path, payload=None, viewer="public", expected=200, target_base=None):
                    nonlocal alt_checks
                    headers = {"Origin": "http://127.0.0.1:3005"}
                    if viewer:
                        headers["Cookie"] = f"media_session={tokens[viewer]}"
                    data = None
                    if payload is not None:
                        data = json.dumps(payload).encode()
                        headers["Content-Type"] = "application/json"
                    request = urllib.request.Request((target_base or base) + path, method=method, data=data, headers=headers)
                    try:
                        response = urllib.request.urlopen(request, timeout=10)
                    except urllib.error.HTTPError as error:
                        response = error
                    with response:
                        body = response.read()
                        assert response.status == expected, f"{method} {path}: {response.status} != {expected}"
                        assert response.headers.get("Cache-Control") == "private, no-store"
                        parsed = json.loads(body) if body else None
                    alt_checks += 1
                    return parsed

                def upload_image():
                    nonlocal alt_checks
                    import struct, zlib
                    def chunk(kind, content):
                        return struct.pack(">I", len(content)) + kind + content + struct.pack(">I", zlib.crc32(kind + content) & 0xffffffff)
                    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"\x00\xff\x00\x00\x00\xff\x00" * 2)) + chunk(b"IEND", b"")
                    boundary = "mediafixture" + secrets.token_hex(8)
                    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"fixture.png\"\r\nContent-Type: image/png\r\n\r\n".encode() + png + f"\r\n--{boundary}--\r\n".encode())
                    request = urllib.request.Request(base + "/api/posts/upload-image", method="POST", data=body, headers={"Origin": "http://127.0.0.1:3005", "Cookie": f"media_session={tokens['public']}", "Content-Type": f"multipart/form-data; boundary={boundary}"})
                    with urllib.request.urlopen(request, timeout=10) as response:
                        result = json.load(response)
                    alt_checks += 1
                    return result["image_url"]

                first_image = upload_image()
                for payload in [
                    {"content": "descriere", "image_alt": "Fără imagine"},
                    {"content": "descriere", "image_url": first_image, "image_alt": "📷" * 301},
                    {"content": "descriere", "image_url": first_image, "image_alt": "control\u0000ascuns"},
                ]:
                    alt_request("POST", "/api/posts", payload, expected=400)
                description = 'Afiș cu "cărți" & <detalii>.'
                created = alt_request("POST", "/api/posts", {"content": "O descriere de imagine", "image_url": first_image, "image_alt": "  " + description + "  "})
                post_path = "/api/posts/" + created["id"]
                assert created["image_alt"] == description
                alt_request("PUT", post_path, {"content": "Unauthorized metadata", "image_url": None, "image_alt": "Changed"}, viewer=None, expected=401)
                alt_request("PUT", post_path, {"content": "Unauthorized metadata", "image_url": None, "image_alt": "Changed"}, viewer="follower", expected=403)
                alt_request("GET", post_path, viewer="outsider", expected=404)
                assert alt_request("GET", post_path, viewer=None)["image_alt"] == description
                assert any(item["id"] == created["id"] and item["image_alt"] == description for item in alt_request("GET", "/api/posts", viewer=None))
                assert any(item["id"] == created["id"] and item["image_alt"] == description for item in alt_request("GET", f"/api/users/{ids['public']}/posts", viewer=None))
                alt_request("POST", post_path + "/save", viewer="follower")
                assert any(item["id"] == created["id"] and item["image_alt"] == description for item in alt_request("GET", "/api/saved-posts", viewer="follower"))
                sql(f"INSERT INTO follows (follower_id,followed_id) VALUES ('{ids['follower']}','{ids['public']}')", database)
                assert any(item["id"] == created["id"] and item["image_alt"] == description for item in alt_request("GET", "/api/feed/following", viewer="follower"))
                assert any(item["id"] == created["id"] and item["image_alt"] == description for item in alt_request("GET", "/api/search?q=descriere", viewer="follower")["posts"])
                import html
                with urllib.request.urlopen(base + "/post/" + created["id"], timeout=10) as response:
                    rendered = response.read().decode()
                    assert f'alt="{html.escape(description, quote=True)}"' in rendered
                    assert "<detalii>" not in rendered
                alt_checks += 1
                assert alt_request("PUT", post_path, {"content": "Descriere păstrată", "image_url": first_image})["image_alt"] == description
                assert alt_request("PUT", post_path, {"content": "Descriere eliminată", "image_url": first_image, "image_alt": ""})["image_alt"] is None
                maximum = "📷" * 300
                assert alt_request("PUT", post_path, {"content": "Descriere lungă", "image_url": first_image, "image_alt": maximum})["image_alt"] == maximum
                second_image = upload_image()
                assert alt_request("PUT", post_path, {"content": "Imagine înlocuită", "image_url": second_image, "image_alt": maximum})["image_alt"] == maximum
                alt_request("PUT", "/api/users/me/privacy", {"is_private": True})
                hidden = alt_request("GET", post_path, viewer=None, expected=404)
                assert maximum not in json.dumps(hidden, ensure_ascii=False)
                assert alt_request("GET", post_path, viewer="follower")["image_alt"] == maximum
                sql(f"DELETE FROM follows WHERE follower_id='{ids['follower']}' AND followed_id='{ids['public']}'", database)
                alt_request("GET", post_path, viewer="follower", expected=404)
                alt_request("PUT", "/api/users/me/privacy", {"is_private": False})

                compatibility = os.environ.get("MEDIA_COMPATIBILITY_BINARY")
                if compatibility:
                    with socket.socket() as listener:
                        listener.bind(("127.0.0.1", 0))
                        compatibility_port = listener.getsockname()[1]
                    compatibility_base = f"http://127.0.0.1:{compatibility_port}"
                    old = subprocess.Popen([compatibility], cwd=root, env={**environment, "SERVER_PORT": str(compatibility_port)}, stdout=log, stderr=log)
                    try:
                        for _ in range(100):
                            try:
                                with urllib.request.urlopen(compatibility_base + "/api/health/ready", timeout=1) as response:
                                    if response.status == 200:
                                        break
                            except (OSError, urllib.error.URLError):
                                time.sleep(0.1)
                        else:
                            raise AssertionError("Prior API did not start against the new schema")
                        old_post = alt_request("GET", post_path, target_base=compatibility_base)
                        assert "image_alt" not in old_post
                        alt_request("PUT", post_path, {"content": "Imagine eliminată de versiunea veche", "image_url": None}, target_base=compatibility_base)
                        assert alt_request("GET", post_path)["image_alt"] is None
                        third_image = upload_image()
                        alt_request("PUT", post_path, {"content": "Imagine nouă", "image_url": third_image, "image_alt": description})
                        fourth_image = upload_image()
                        alt_request("PUT", post_path, {"content": "Înlocuită de versiunea veche", "image_url": fourth_image}, target_base=compatibility_base)
                        assert alt_request("GET", post_path)["image_alt"] is None
                        second_image = fourth_image
                        print("rollback_compatibility=passed; old binary startup, reads, image removal/replacement metadata cleanup")
                    finally:
                        old.terminate()
                        old.wait(timeout=15)

                alt_request("PUT", post_path, {"content": "Descriere pentru export", "image_url": second_image, "image_alt": description})
                reset = secrets.token_hex(24)
                reset_hash = hashlib.sha256(reset.encode()).hexdigest()
                sql(f"INSERT INTO email_tokens (id,user_id,token,token_type,expires_at) VALUES ('{uuid.uuid4()}','{ids['public']}','{reset_hash}','password_reset',DATE_ADD(NOW(),INTERVAL 1 HOUR))", database)
                alt_request("POST", "/api/auth/reset-password", {"token": reset, "password": "Export fixture password 2026!"}, viewer=None)
                _, public_cookie = identity_request("/api/auth/login", {"email": "public@example.invalid", "password": "Export fixture password 2026!"})
                tokens["public"] = public_cookie.split("=", 1)[1]
                exported = alt_request("POST", "/api/users/me/export", {"password": "Export fixture password 2026!"})
                assert exported["format_version"] == 8
                assert any(item["id"] == created["id"] and item["image_alt"] == description for item in exported["posts"])
                print(f"image_alt_checks={alt_checks}; passed; validation, upload, feeds, search, saved, privacy, escaping, replacement and export v8")
                process.terminate()
                process.wait(timeout=15)
                process = None
    finally:
        if process is not None:
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        if created_database:
            sql(f"DROP DATABASE `{database}`")
        if created_user:
            sql(f"DROP USER '{db_user}'@'127.0.0.1'")
        print("disposable_database_user_and_uploads=removed")


if __name__ == "__main__":
    main()
