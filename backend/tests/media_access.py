#!/usr/bin/env python3
"""Disposable MariaDB + HTTP media authorization regression.

Run as a MariaDB socket administrator after cargo build --release --locked.
Only randomly named test databases/users and a temporary upload tree are touched.
No production environment file, credentials, accounts or upload paths are used.
"""
import hashlib
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
