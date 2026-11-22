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
                assert latest == 20261030000000, "update runner fixture for the current last migration"
                sql(f"DROP TABLE notification_preferences; DELETE FROM _sqlx_migrations WHERE version={latest}", database)
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
