const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const csv = require('csv-parser');

const serviceAccount = require('../script-huerto/serviceAccountKey.json');
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function parseRange(value) {
  if (!value || value.trim() === "") return null;
  const parts = value.split('-').map(n => parseFloat(n.trim()));
  return parts.length === 2 ? (parts[0] + parts[1]) / 2 : (parseFloat(parts[0]) || null);
}

async function uploadPlantas() {
  const semillasRef = db.collection('catalogo_semillas');
  const batch = db.batch();
  let count = 0;

  console.log("Iniciando lectura de plantas.csv...");

  fs.createReadStream('../plantas.csv')
    .pipe(csv({
      // Esta configuración ayuda a ignorar caracteres ocultos al inicio del archivo
      skipLines: 0,
      mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, '') 
    }))
    .on('data', (row) => {
      // Usamos trim para limpiar posibles espacios en blanco en el nombre de la columna
      const nombre = row['Nombre'] ? row['Nombre'].trim() : null;
      
      // FILTRO ESTRICTO: Solo procesamos si el nombre existe y no es una fila vacía
      if (!nombre || nombre === "") return;

      console.log(`✅ Procesando: ${nombre}`);

      const docId = nombre.toLowerCase().replace(/\s+/g, '_');
      const docRef = semillasRef.doc(docId);

      const plantaData = {
        nombre: nombre,
        tipo: row['Tipo'] || "desconocido",
        dias_siembra_a_cosecha: parseRange(row['Días siembra']),
        temporada_siembra: [],
        requerimientos: {
          agua_mm_semana: row['CONSUMO HÍDRICO (mm/semana)'] || null,
          nitrogeno: parseFloat(row['nitrógeno']) || null,
          fosforo: parseFloat(row['fósforo']) || null,
          potasio: parseFloat(row['potasio']) || null
        },
        condiciones_optimas: {
          fotoperiodo: row['FOTOPERIODO'] || null,
          temp_optima: row['Temp Óptima'] || null,
          cm_entre_plantas: row['Cm entre plantas'] || null,
          profundidad_raiz_cm: row['PROFUNDIDAD DE RAÍZ (cm)'] || null
        }
      };

      batch.set(docRef, plantaData);
      count++;
    })
    .on('end', async () => {
      if (count === 0) {
        console.log("❌ Error: No se detectó ninguna planta válida. Revisa que el archivo tenga encabezados correctos.");
      } else {
        console.log(`Subiendo ${count} plantas a Firestore...`);
        await batch.commit();
        console.log('¡Éxito! Base de datos actualizada.');
      }
      process.exit(0);
    });
}

uploadPlantas();