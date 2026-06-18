-- Material-type-specific cataloging fields (desktop).
-- volume, issue_number, and call_number_type already exist (0000) — not re-added.
ALTER TABLE resources ADD COLUMN frequency TEXT;
ALTER TABLE resources ADD COLUMN container_title TEXT;
ALTER TABLE resources ADD COLUMN pages TEXT;
ALTER TABLE resources ADD COLUMN thesis_degree TEXT;
ALTER TABLE resources ADD COLUMN thesis_institution TEXT;
ALTER TABLE resources ADD COLUMN thesis_advisor TEXT;
