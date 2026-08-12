/**
 * scripts/activar-jingles.js — OBSOLETO (2026-08-12)
 * ------------------------------------------------------------------
 * Este script partía de un diagnóstico equivocado: que el "da la hora" y las
 * cuñas sonaban por ser JINGLE y que solo faltaba reiniciar la estación.
 *
 * Ninguna de las dos cosas era cierta:
 *   • `is_jingle` no programa nada — el propio OpenAPI de AzuraCast dice que
 *     solo sirve para "no mandar metadata al AutoDJ ni disparar webhooks".
 *     Lo que programa es `playlist.type`, y este script las dejaba en
 *     `default`, donde `play_per_songs` se ignora.
 *   • No hacía falta reiniciar: con `write_playlists_to_liquidsoap: false`
 *     (el default) las playlists de tipo `songs` las sirve el AutoDJ de PHP.
 *     Los restarts cortaban el stream de los clientes para nada.
 *
 * Reemplazado por:  node scripts/migrar-programacion.js <id-o-nombre> --aplicar
 * ------------------------------------------------------------------
 */
console.error(`
❌ activar-jingles.js está obsoleto y ya no hace nada.

   Partía de un diagnóstico equivocado (is_jingle no programa; lo que programa
   es playlist.type) y reiniciaba estaciones sin necesidad.

   Usa en su lugar:
     node scripts/migrar-programacion.js <id-o-nombre>            # simulación
     node scripts/migrar-programacion.js <id-o-nombre> --aplicar
     node scripts/migrar-programacion.js --todos --aplicar
`);
process.exit(1);
