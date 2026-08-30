"""`migrate.py`'s hand-rolled statement splitter.

docs/41 Phase 2 needs a PL/pgSQL trigger function in a migration for the
first time in this repo - its $$...$$ body contains semicolons that must
not be mistaken for statement terminators, which the splitter did not
handle before this phase (it only tracked '...' strings and -- comments).
"""

from __future__ import annotations

from pathlib import Path

from migrate import _split_statements


def test_semicolon_inside_dollar_quoted_function_body_does_not_split():
    sql = """
    CREATE OR REPLACE FUNCTION f() RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'blocked: %', TG_OP;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER t BEFORE UPDATE ON x FOR EACH ROW EXECUTE FUNCTION f();
    """
    statements = _split_statements(sql)
    assert len(statements) == 2
    assert 'RAISE EXCEPTION' in statements[0]
    assert 'END;' in statements[0]
    assert statements[0].rstrip().endswith('LANGUAGE plpgsql')
    assert statements[1].startswith('CREATE TRIGGER')


def test_tagged_dollar_quote_is_respected():
    sql = "SELECT $tag$a; b;$tag$; SELECT 1;"
    statements = _split_statements(sql)
    assert statements == ['SELECT $tag$a; b;$tag$', 'SELECT 1']


def test_semicolon_inside_comment_still_does_not_split():
    sql = "-- direct-path only; will not fit in a frame\nSELECT 1;"
    statements = _split_statements(sql)
    assert statements == ['-- direct-path only; will not fit in a frame\nSELECT 1']


def test_semicolon_inside_string_still_does_not_split():
    sql = "SELECT 'a; b'; SELECT 2;"
    statements = _split_statements(sql)
    assert statements == ["SELECT 'a; b'", 'SELECT 2']


def test_the_actual_audit_migration_splits_into_expected_statement_count():
    path = (
        Path(__file__).resolve().parent.parent
        / 'migrations'
        / '022_operations_audit_events.sql'
    )
    sql = path.read_text(encoding='utf-8')
    statements = _split_statements(sql)
    # CREATE TABLE, 2x CREATE INDEX, CREATE OR REPLACE FUNCTION, DROP
    # TRIGGER IF EXISTS, CREATE TRIGGER.
    assert len(statements) == 6
    assert any('CREATE TABLE IF NOT EXISTS operations_audit_events' in s for s in statements)
    assert any('CREATE OR REPLACE FUNCTION' in s and s.rstrip().endswith('LANGUAGE plpgsql') for s in statements)
    assert any(s.strip().startswith('CREATE TRIGGER') for s in statements)
