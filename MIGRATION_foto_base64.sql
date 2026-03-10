-- Migration: Adicionar coluna foto_base64 na tabela usuarios
-- Execute este SQL no Supabase SQL Editor

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_base64 TEXT;

COMMENT ON COLUMN usuarios.foto_base64 IS 'Foto do usuário em base64 para sincronização com leitores faciais';
