import { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import { useAuth } from '../../auth';
import StatTile from '../../components/charts/StatTile';
import { IconServer, IconChart, IconPlaylist } from '../../icons';

/**
 * Panel del cliente de VIDEO.
 *
 * El nodo de video todavía no está conectado, así que en vez de inventar
 * datos o mostrar tarjetas vacías, se dice con claridad en qué estado está
 * la cuenta. Cuando el nodo exista, esta página se llena con sus videos.
 */
export default function ClienteVideo() {
  const { user } = useAuth();
  const [perfil, setPerfil] = useState(null);

  useEffect(() => {
    apiFetch('/cliente/perfil').then((d) => setPerfil(d.perfil)).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl p-6 bg-gradient-to-br from-brand-600 to-emerald-600 text-white shadow-sm">
        <h2 className="text-xl font-bold">Hola, {perfil?.nombre_empresa || user?.nombre_empresa || 'tu canal'} 🎬</h2>
        <p className="text-brand-50/90 text-sm mt-1">
          Plan {perfil?.plan || '—'} · Tu servicio de video
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatTile label="Videos" value="0" icon={IconPlaylist} color="violet" hint="aún sin subir" />
        <StatTile label="Reproducciones" value="0" icon={IconChart} color="blue" hint="este mes" />
        <StatTile label="Almacenamiento" value="—" icon={IconServer} color="amber" hint="según tu plan" />
      </div>

      <div className="card p-8 text-center">
        <div className="text-4xl mb-3">🎬</div>
        <h3 className="font-semibold text-lg">Estamos preparando tu canal</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-md mx-auto">
          Tu cuenta ya está creada. En cuanto tu espacio de video quede listo podrás
          subir tus videos desde aquí y compartirlos con tu audiencia.
        </p>
        <p className="text-xs text-gray-400 mt-4">
          ¿Tienes dudas? Escríbenos y te contamos cómo va.
        </p>
      </div>
    </div>
  );
}
