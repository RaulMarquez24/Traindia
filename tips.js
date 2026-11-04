// Trucos de «Aprende», por temas. Cada uno se abre como una historia (news.js):
// captura de la app con datos de ejemplo (aprende/*.jpg) y, si se puede, «Pruébalo».
// try: 'planAI' | 'share' | 'feedback' | 'go:<vista>' | 'go:progress:<pestaña>'.
// k: palabras extra para el buscador (sinónimos, cómo lo diría alguien).
const TIPS_DATA = {
  cats: [
    { id: 'empezar', name: 'Empezar', icon: 'star', bg: '#4f46e5', dk: '#312e81' },
    { id: 'entrenar', name: 'Entrenar', icon: 'dumbbell', bg: '#b45309', dk: '#78350f' },
    { id: 'planes', name: 'Planes', icon: 'calendar', bg: '#0f766e', dk: '#134e4a' },
    { id: 'progreso', name: 'Progreso', icon: 'trendUp', bg: '#0e7490', dk: '#164e63' },
    { id: 'nutricion', name: 'Nutrición', icon: 'notebook', bg: '#15803d', dk: '#14532d' },
    { id: 'compartir', name: 'Compartir y datos', icon: 'users', bg: '#be185d', dk: '#831843' },
    { id: 'app', name: 'La app', icon: 'settings', bg: '#475569', dk: '#1e293b' },
  ],
  tips: [
    // ---- Empezar ----
    { id: 'plantilla', cat: 'empezar', title: 'Empieza con una plantilla', text: 'Más → Planes → «Nuevo plan» y elige «Full body clásico»: la semana sale hecha, con series y descansos.', shot: 'aprende/crear-plan.jpg', try: 'go:info', k: 'plan nuevo crear rutina' },
    { id: 'semana', cat: 'empezar', title: 'Tu semana de un vistazo', text: 'Cada día con su intensidad (fuerte, moderado o ligero) y lo que dura. Toca uno para ver qué te toca.', shot: 'aprende/week.jpg', try: 'go:week', k: 'semana dias inicio' },
    { id: 'ordenar', cat: 'empezar', title: 'Ordena los días a tu gusto', text: 'Deja pulsado un día de la semana y arrástralo a su sitio. Toca «Listo» al acabar.', shot: 'aprende/reorder.jpg', k: 'mover cambiar orden arrastrar' },
    { id: 'instalar', cat: 'empezar', title: 'Instálala como una app', text: 'Más → Ajustes → «Instalar en el móvil». Se abre a pantalla completa, con su icono, y funciona sin conexión.', shot: 'aprende/settings.jpg', try: 'go:settings', k: 'instalar icono pantalla de inicio' },
    { id: 'sin-conexion', cat: 'empezar', title: 'Funciona sin conexión', text: 'Tu plan, tus entrenos y tus datos viven en el móvil: puedes entrenar en un sótano sin cobertura.', shot: 'aprende/week.jpg', k: 'offline internet datos cobertura' },

    // ---- Entrenar ----
    { id: 'empezar-entreno', cat: 'entrenar', title: 'Empieza desde cualquier día', text: 'Sesiones → «Empezar entreno» y eliges el día, o «Entreno libre» si vas sin plan.', shot: 'aprende/pick-day.jpg', try: 'go:sessions', k: 'iniciar comenzar entreno libre' },
    { id: 'ultima-vez', cat: 'entrenar', title: 'La última vez, siempre a la vista', text: 'Encima de cada ejercicio ves lo que hiciste la última vez. Si tocas ✓ en una serie vacía, copia esos números.', shot: 'aprende/live.jpg', k: 'anterior historial copiar' },
    { id: 'repetir', cat: 'entrenar', title: 'Repite el bloque en un toque', text: '«↻ repetir» copia todas las series del ejercicio ×2, ×3… Y «duplicar» copia solo una serie.', shot: 'aprende/repetir.jpg', k: 'copiar series duplicar rapido' },
    { id: 'dropset', cat: 'entrenar', title: 'Dropsets sin liarte', text: '«↧ dropset» debajo de una serie añade la bajada de peso dentro de la misma serie.', shot: 'aprende/live.jpg', k: 'drop set bajar peso' },
    { id: 'esfuerzo', cat: 'entrenar', title: 'Apunta cómo de dura fue', text: 'El botón % de cada serie guarda el esfuerzo (del 50 al 100 %). En Progreso puedes mirar solo las series con esfuerzo marcado.', shot: 'aprende/esfuerzo.jpg', k: 'rpe rir intensidad porcentaje' },
    { id: 'descanso', cat: 'entrenar', title: 'Descanso con cuenta atrás', text: '«Descanso · 90s» lo lanza y ▾ cambia el tiempo. La cuenta sigue a la vista aunque cambies de pantalla, con «+15s».', shot: 'aprende/descanso.jpg', k: 'temporizador cronometro tiempo pausa' },
    { id: 'aviso-descanso', cat: 'entrenar', title: 'Te avisa aunque bloquees el móvil', text: 'Activa «Aviso de fin de descanso» en Ajustes y te llega la notificación con la app cerrada o el móvil bloqueado.', shot: 'aprende/settings-notif.jpg', try: 'go:settings', k: 'notificacion sonido vibracion alarma' },
    { id: 'cardio', cat: 'entrenar', title: 'Cardio con ritmo, km y pulso', text: 'En los ejercicios de tiempo, «+ datos» añade distancia, ritmo, pulsaciones o kcal. Y les pones etiqueta: Z2, correr…', shot: 'aprende/datos.jpg', k: 'correr cinta bici distancia ritmo zona' },
    { id: 'ia-ejercicio', cat: 'entrenar', title: 'Pregunta a una IA en mitad del entreno', text: 'El bocadillo de cada ejercicio prepara la pregunta (ejercicio, objetivo y tu duda) para ChatGPT, Gemini o Claude.', shot: 'aprende/ia-ejercicio.jpg', k: 'chatgpt gemini claude duda' },
    { id: 'documentos', cat: 'entrenar', title: 'Tus PDFs y fotos, a mano', text: 'Guarda en Más → Documentos el plan del entrenador o lo del fisio y ábrelo entrenando con el icono del libro.', shot: 'aprende/docs.jpg', try: 'go:docs', k: 'pdf fotos fisio documento' },
    { id: 'entreno-salvo', cat: 'entrenar', title: 'Tu entreno no se pierde', text: 'Si recargas o cierras la app, al volver estás donde lo dejaste. Para tirarlo, «Descartar entreno» dentro del entreno.', shot: 'novedades/entreno.jpg', k: 'perder recuperar continuar' },
    { id: 'terminar', cat: 'entrenar', title: 'Termina sin dejarte nada', text: 'Al «Finalizar y guardar» te avisa si quedan ejercicios sin apuntar. Y si batiste una marca, te lo celebra.', shot: 'aprende/session.jpg', k: 'guardar acabar finalizar record' },

    // ---- Planes ----
    { id: 'plan-ia', cat: 'planes', title: 'Tu plan del entrenador con una IA', text: 'Pásale el PDF o las fotos a tu IA y pega lo que te devuelva: Traindía lo convierte en tu plan.', video: 'plan-ia', try: 'planAI', k: 'pdf entrenador chatgpt importar' },
    { id: 'dia', cat: 'planes', title: 'Mira qué toca cada día', text: 'En el día ves cada ejercicio con lo que hiciste la última vez y si vas mejorando.', shot: 'aprende/day.jpg', try: 'go:week', k: 'dia ejercicios hoy' },
    { id: 'ficha', cat: 'planes', title: 'Cómo se hace y con qué cambiarlo', text: 'Toca un ejercicio: técnica, vídeos, tus últimas veces y suplentes por si la máquina está ocupada.', shot: 'aprende/tecnica.jpg', k: 'tecnica video suplente alternativa maquina ocupada' },
    { id: 'editar-dia', cat: 'planes', title: 'Ajusta un día a tu medida', text: 'En el día, ⋯ → «Editar día»: ejercicios, series, tipo de día, lugar y un Plan B.', shot: 'aprende/day.jpg', k: 'editar cambiar ejercicios lugar gimnasio' },
    { id: 'guias', cat: 'planes', title: 'Guías hechas para tu plan', text: 'Más → Guías → «Crear guías con la IA»: cómo progresar, técnica, calentamiento… sobre tu propio plan.', shot: 'aprende/guides.jpg', try: 'go:guides', k: 'guia consejos progresar calentamiento' },
    { id: 'catalogo', cat: 'planes', title: 'Tu catálogo de ejercicios', text: 'Más → Ejercicios: busca, crea los tuyos, añade vídeos y une los que estén repetidos.', shot: 'aprende/exercises.jpg', try: 'go:exercises', k: 'ejercicios crear duplicados' },
    { id: 'varios-planes', cat: 'planes', title: 'Varios planes, uno activo', text: 'Más → Planes: duplica, renombra o activa otro cuando cambies de bloque. Tu historial no se pierde.', shot: 'aprende/info.jpg', try: 'go:info', k: 'bloque cambiar plan activar duplicar' },

    // ---- Progreso ----
    { id: 'racha', cat: 'progreso', title: 'Tu racha de semanas', text: 'En Sesiones ves cuántas semanas seguidas llevas y un calendario coloreado por intensidad.', shot: 'aprende/sessions.jpg', try: 'go:sessions', k: 'calendario constancia semanas' },
    { id: 'amaneciste', cat: 'progreso', title: '¿Cómo amaneciste?', text: 'Al día siguiente te pregunta cómo te levantaste: igual o mejor, sube; algo cargado, mantén; peor, baja.', shot: 'aprende/amaneciste.jpg', k: 'semaforo agujetas cansado subir carga' },
    { id: 'medidas', cat: 'progreso', title: 'Peso y medidas con gráfica', text: 'Progreso → Corporal → «+ Registrar medida». Cada medida tiene su gráfica.', shot: 'aprende/prog-body.jpg', try: 'go:progress:body', k: 'peso cintura grafica' },
    { id: 'por-ejercicio', cat: 'progreso', title: 'La evolución de cada ejercicio', text: 'Progreso → Por ejercicio: peso máximo, 1RM estimado, volumen o repeticiones a lo largo del tiempo.', shot: 'aprende/prog-ex.jpg', try: 'go:progress:exercise', k: '1rm fuerza grafica volumen' },
    { id: 'records', cat: 'progreso', title: 'Todos tus récords', text: 'Progreso → Récords: busca cualquier ejercicio y mira tu mejor marca.', shot: 'aprende/prog-rec.jpg', try: 'go:progress:records', k: 'record marca mejor pr' },
    { id: 'comparativa', cat: 'progreso', title: 'Compárate con un amigo', text: 'Progreso → Comparativa: su peso o un ejercicio contra el tuyo, en la misma gráfica.', shot: 'aprende/prog-cmp.jpg', try: 'go:progress:compare', k: 'comparar amigo invitado' },

    // ---- Nutrición ----
    { id: 'pauta', cat: 'nutricion', title: 'Tu pauta de comidas', text: 'Cada comida del día en su tarjeta. La app elige sola «Día de entreno» o «Día de descanso» mirando tu plan.', shot: 'aprende/nutricion-pauta.jpg', try: 'go:nutrition', k: 'dieta comida nutricionista dia descanso' },
    { id: 'comida', cat: 'nutricion', title: 'Lo que te toca, con sus gramos', text: 'Dentro de cada comida ves los alimentos con su cantidad y por cuáles puedes cambiarlos.', shot: 'aprende/nutricion-comida.jpg', try: 'go:nutrition', k: 'gramos cantidad cambiar alimento' },
    { id: 'platos', cat: 'nutricion', title: 'Guarda tus platos', text: 'En cada comida, «Plato con esto» guarda la receta, con foto y preparación. La próxima vez la tienes arriba.', shot: 'aprende/nutricion-platos.jpg', try: 'go:nutrition', k: 'receta plato foto preparacion' },
    { id: 'pauta-documento', cat: 'nutricion', title: 'Desde el documento del nutricionista', text: '«Crear desde un documento»: le pasas el PDF a una IA y pegas lo que te devuelva. O empiezas a mano.', shot: 'aprende/nutrition.jpg', try: 'go:nutrition', k: 'pdf nutricionista ia importar' },
    { id: 'suplementos', cat: 'nutricion', title: 'Normas, suplementos y documentos', text: 'Debajo de las comidas: lo que te dijo tu nutricionista, tu suplementación y sus documentos a mano.', shot: 'aprende/nutricion-extra.jpg', try: 'go:nutrition', k: 'creatina proteina suplemento agua' },

    // ---- Compartir y datos ----
    { id: 'amigos', cat: 'compartir', title: 'Comparte con amigos', text: '⇧ → «Compartir con amigos» crea un enlace para WhatsApp. Vale para todo el grupo durante 48 horas.', shot: 'novedades/compartir-1.jpg', try: 'share', k: 'enlace whatsapp grupo amigo' },
    { id: 'lo-que-ve', cat: 'compartir', title: 'Lo que ve tu amigo', text: 'Al abrir tu enlace elige: compararos, quedarse con tu plan o usar tu nutrición. Sus datos no se mezclan con los tuyos.', shot: 'novedades/compartir-2.jpg', k: 'enlace amigo plan nutricion' },
    { id: 'copia', cat: 'compartir', title: 'Haz una copia completa', text: 'Más → Copias y datos → «Hacer copia completa ahora». Con ese archivo recuperas todo en otro móvil.', shot: 'aprende/backups.jpg', try: 'go:backups', k: 'backup copia seguridad movil nuevo' },
    { id: 'pdf', cat: 'compartir', title: 'El entreno en PDF para tu entrenador', text: 'En una sesión, «Compartir» → «PDF para tu entrenador».', shot: 'aprende/session.jpg', k: 'pdf entrenador enviar sesion' },
    { id: 'invitados', cat: 'compartir', title: 'Entrena con amigos en tu móvil', text: 'Más → Perfiles: añade a alguien y apunta sus entrenos aparte, sin mezclarlos con los tuyos.', shot: 'aprende/profiles.jpg', try: 'go:profiles', k: 'perfil invitado pareja' },
    { id: 'exportar', cat: 'compartir', title: 'Exporta e importa lo que quieras', text: 'El botón ⇧ de arriba: exporta tu plan, un día o tus sesiones, e importa lo que te pasen.', shot: 'aprende/share-menu.jpg', k: 'exportar importar archivo json' },

    // ---- La app ----
    { id: 'tema', cat: 'app', title: 'Modo oscuro', text: 'Más → Ajustes → Apariencia: como el sistema, claro u oscuro.', shot: 'aprende/settings-dark.jpg', try: 'go:settings', k: 'oscuro claro tema noche' },
    { id: 'actualiza', cat: 'app', title: 'Se pone al día sola', text: 'No hace falta cerrarla: se actualiza cuando no estás en nada. Y en Ajustes tienes «Buscar actualizaciones».', shot: 'novedades/actualizar.jpg', k: 'actualizar version nueva' },
    { id: 'sugerencias', cat: 'app', title: 'Cuéntame ideas o fallos', text: 'Más → «Sugerencias y reportes»: me llega directo y te contesto si dejas tu contacto.', shot: 'aprende/feedback.jpg', try: 'feedback', k: 'idea fallo error reporte contacto' },
  ],
};
