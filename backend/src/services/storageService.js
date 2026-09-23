const { supabase } = require('../config/supabase');

const BUCKET_NAME = 'macrocase-audios';

async function uploadMacrocaseAudio({
  fileBuffer,
  filePath,
  contentType,
}) {
  if (!fileBuffer) {
    throw new Error('No se recibió el archivo de audio.');
  }

  if (!filePath) {
    throw new Error('No se especificó la ruta del archivo.');
  }

  if (!contentType) {
    throw new Error('No se especificó el tipo MIME del archivo.');
  }

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, fileBuffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Error al subir el audio: ${error.message}`);
  }

  const { data } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath);

  return {
    path: filePath,
    publicUrl: data.publicUrl,
  };
}

async function deleteMacrocaseAudio(filePath) {
  if (!filePath) {
    throw new Error('No se especificó la ruta del archivo.');
  }

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([filePath]);

  if (error) {
    throw new Error(`Error al eliminar el audio: ${error.message}`);
  }

  return true;
}

module.exports = {
  uploadMacrocaseAudio,
  deleteMacrocaseAudio,
};