# Moderation operations

This runbook covers the privileged moderation workflow for Media. It is for the
operator of the production VPS and must not be exposed through a public admin
endpoint or copied into a client bundle.

## Security invariants

- New accounts always receive the `user` role.
- Only `moderator` and `admin` may read moderation queues.
- Only `admin` may read the role-change history.
- Every report mutation requires the moderator's current password again.
- Reporters are pseudonymous in moderator responses; their IDs, usernames, and
  email addresses are not returned.
- A moderator cannot process their own report or a report about their content,
  including after the original target is deleted.
- A report must be claimed before a decision. State changes and report-audit
  events commit in one transaction.
- `resolved` is a triage state. It does not delete content, suspend an account,
  or notify a user.
- There is no HTTP endpoint that grants or revokes roles.

## Granting a role

Prefer `moderator`. Grant `admin` only for a documented operational need because
administrators can override another moderator's assignment and inspect all role
changes.

Before a grant:

1. Verify the person's account ID through two independent, private channels.
2. Confirm that the account uses a unique strong password and has no unexplained
   active sessions.
3. Record the approver, reason, requested role, account ID, and UTC time in the
   restricted change log.
4. Use the exact account ID, never a partial username or email match.

Run the following from the local MariaDB administrative session, replacing only
the UUID and desired allowlisted role:

```sql
START TRANSACTION;
SELECT id, username, role
FROM users
WHERE id = '00000000-0000-4000-8000-000000000000'
FOR UPDATE;

UPDATE users
SET role = 'moderator'
WHERE id = '00000000-0000-4000-8000-000000000000'
  AND role = 'user';

SELECT ROW_COUNT() AS changed_rows;
COMMIT;
```

`changed_rows` must equal `1`. The database trigger writes the old/new role,
account reference, username snapshot, database actor, and timestamp to
`moderation_role_events`. Confirm the event in the administrator-only `Roluri`
tab before considering the grant complete. Do not edit or delete the audit row.

## Normal revocation

1. Have the moderator release every report currently assigned to them through
   `/moderare`; this preserves ordinary action events.
2. Change the role to `user` by exact ID in a transaction.
3. Confirm the automatic event in the `Roluri` tab.
4. Ask the person to reload the application. Authorization is checked from the
   database on every moderation request, so an existing session cannot retain
   the revoked privilege.

```sql
START TRANSACTION;
SELECT id, username, role
FROM users
WHERE id = '00000000-0000-4000-8000-000000000000'
FOR UPDATE;

UPDATE users
SET role = 'user'
WHERE id = '00000000-0000-4000-8000-000000000000'
  AND role IN ('moderator', 'admin');

SELECT ROW_COUNT() AS changed_rows;
COMMIT;
```

## Emergency revocation

For suspected account takeover or privilege misuse, preserve logs first when it
is safe, then revoke the role and all sessions in one transaction. Reopen the
account's in-progress reports and append a release event before the update.

```sql
START TRANSACTION;
SELECT id, username, role
FROM users
WHERE id = '00000000-0000-4000-8000-000000000000'
FOR UPDATE;

INSERT INTO moderation_audit_events (
    id, report_id, report_reference, moderator_id, action,
    previous_status, new_status, created_at
)
SELECT
    UUID(), id, id, NULL, 'report_released',
    'reviewing', 'open', CURRENT_TIMESTAMP(6)
FROM content_reports
WHERE assigned_moderator_id = '00000000-0000-4000-8000-000000000000'
  AND status = 'reviewing';

UPDATE content_reports
SET status = 'open', assigned_moderator_id = NULL,
    updated_at = CURRENT_TIMESTAMP(6)
WHERE assigned_moderator_id = '00000000-0000-4000-8000-000000000000'
  AND status = 'reviewing';

UPDATE users
SET role = 'user'
WHERE id = '00000000-0000-4000-8000-000000000000';

UPDATE sessions
SET revoked_at = CURRENT_TIMESTAMP(6)
WHERE user_id = '00000000-0000-4000-8000-000000000000'
  AND revoked_at IS NULL;
COMMIT;
```

Continue with the main incident-response runbook. Correlate the automatic role
event, released-report events, request IDs, system logs, and the restricted
incident log. Never include report text or passwords in tickets or chat.

## Data handling and retention

- Evidence snapshots contain the target username plus at most 2,000 characters
  of profile/post/comment text. They exist so deleting the target cannot erase
  an active report.
- Reporter-supplied context and internal resolution notes are limited to 1,000
  characters. Store the minimum needed for the decision.
- Active reports are capped at 100 per reporter; all stored reports are capped
  at 2,000 per reporter; submissions are capped at 20 per rolling 24 hours.
- Final reports older than 365 days are opportunistically pruned when that
  reporter creates another report. This is a storage control, not a complete
  organization-wide retention program.
- Role events deliberately survive account deletion for security
  accountability. Review and purge events older than the approved security-log
  retention period only through a documented privacy/legal process.
- Reporter exports contain their report states but not internal moderator notes
  or moderator identities. A moderator's export contains their own action and
  role-change history without the database actor.

The application still lacks appeals, legal-hold automation, moderator notices,
automatic enforcement, and a formally approved retention schedule. Treat these
as open product and privacy work, not as implied behavior.

## Monitoring and response

Review at least the following until automated alerts exist:

```sql
SELECT status, COUNT(*)
FROM content_reports
GROUP BY status;

SELECT id, updated_at
FROM content_reports
WHERE status IN ('open', 'reviewing')
  AND updated_at < CURRENT_TIMESTAMP(6) - INTERVAL 24 HOUR
ORDER BY updated_at ASC;

SELECT username_snapshot, previous_role, new_role, created_at
FROM moderation_role_events
ORDER BY created_at DESC
LIMIT 50;
```

Target detection time is 15 minutes for unexpected role changes, bulk report
access, repeated failed step-up attempts, or a stuck queue. Automated alerts do
not yet exist, so current detection time is unknown and manual review is
required.

## Rollback warning

The migration is additive but changes the report lifecycle. Once production has
accepted a terminal or target-deleted report, the old binary is not a safe
long-term rollback target. During the initial zero-user rollout, retain a
database backup and the previous binary. After real workflow data exists, prefer
a forward fix; restore a database backup only with an explicit data-loss decision
and incident record.
