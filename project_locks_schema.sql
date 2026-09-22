-- ══════════════════════════════════════════════════════════════════════════
-- KOLLABORATIVES LOCKING SYSTEM
-- Verhindert gleichzeitige Bearbeitung desselben Projekts durch mehrere User
-- ══════════════════════════════════════════════════════════════════════════

-- Tabelle für Projekt-Locks erstellen
CREATE TABLE IF NOT EXISTS project_locks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  locked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id)
);

-- Index für schnelle Abfragen
CREATE INDEX IF NOT EXISTS idx_project_locks_project_id ON project_locks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_locks_user_id ON project_locks(user_id);
CREATE INDEX IF NOT EXISTS idx_project_locks_expires_at ON project_locks(expires_at);

-- Row Level Security (RLS) aktivieren
ALTER TABLE project_locks ENABLE ROW LEVEL SECURITY;

-- Policies für Lesen (alle authentifizierten User können Locks sehen)
CREATE POLICY "Alle authentifizierten User können Locks lesen"
  ON project_locks FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Policies für Schreiben (nur authentifizierte User können Locks erstellen/ändern)
CREATE POLICY "Authentifizierte User können Locks erstellen"
  ON project_locks FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authentifizierte User können Locks aktualisieren"
  ON project_locks FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "User können ihre eigenen Locks löschen"
  ON project_locks FOR DELETE
  USING (auth.uid() = user_id);

-- Automatisches Aufräumen abgelaufener Locks (optional - kann als cron job eingerichtet werden)
-- DELETE FROM project_locks WHERE expires_at < NOW();

-- Funktion zum Aufräumen alter Locks
CREATE OR REPLACE FUNCTION cleanup_expired_locks()
RETURNS void AS $$
BEGIN
  DELETE FROM project_locks WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Anmerkung: Diese Funktion kann über Supabase Dashboard -> SQL Editor
-- oder als scheduled task ausgeführt werden