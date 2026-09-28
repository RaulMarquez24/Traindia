// ============================================================
// PLANTILLAS DE ENTRENAMIENTO
// ------------------------------------------------------------
// Cada plantilla es un plan completo listo para usar: días con sus ejercicios
// (series, RIR, descansos, prioritarios y opcionales), Plan B por día y guías.
// EXERCISES es el catálogo que traen: técnica, suplentes y datos a registrar.
// Al crear un plan desde una plantilla se REUTILIZAN los ejercicios que el
// usuario ya tiene con el mismo nombre (su progreso sigue enlazado) y solo se
// crean los que falten. Nada de aquí sobrescribe lo que el usuario ya tenga.
// ============================================================

const TEMPLATES = (() => {

  // ---------- Catálogo de las plantillas ----------
  // group: categoría del catálogo · type: weight | reps | time | check
  // subs: suplentes (por nombre; también se crean si faltan) · metrics: datos extra
  const EXERCISES = {
    // Calentamiento y movilidad
    'Cardio suave': { group: 'Calentamiento', type: 'time', metrics: [],
      howto: '5 min en bici, elíptica, remo o andando en cinta inclinada, a un ritmo con el que puedas hablar. Solo sube la temperatura del cuerpo: no debe cansarte.' },
    'Movilidad general': { group: 'Calentamiento', type: 'check', metrics: [],
      howto: '5 min de pies a cabeza, sin prisa: 10 círculos de tobillo por lado, 10 sentadillas profundas lentas agarrado a algo, 8 gato-camello, 8 rotaciones torácicas en cuadrupedia por lado y 10 dislocaciones de hombro con banda o palo. El objetivo es llegar con las articulaciones calientes, no cansarte.' },
    'Activación de glúteos': { group: 'Calentamiento', type: 'check', metrics: [],
      howto: '2 vueltas: 10 puentes de glúteo con 2 s arriba + 10 pasos laterales con banda por lado. Enciende el glúteo antes de las sentadillas y las bisagras, y ayuda a que las rodillas no se vayan hacia dentro.' },
    'Activación de escápulas': { group: 'Calentamiento', type: 'check', metrics: [],
      howto: '2 vueltas: 12 aperturas con banda (band pull-apart) + 8 retracciones escapulares colgado de la barra, bajando y juntando los hombros sin doblar los codos. Prepara el hombro para presses y tirones.' },
    'Estiramientos': { group: 'Estiramientos', type: 'check', metrics: [],
      howto: '5-8 min, 30-45 s por postura respirando lento: flexor de cadera en zancada, isquios, cuádriceps, glúteo (figura 4), pecho en el marco de una puerta y dorsal colgado o en cuadrupedia. Sin rebotes y sin llegar a dolor.' },
    'Cardio Z2': { group: 'Cardio', type: 'time', metrics: ['time', 'distance', 'hr'],
      howto: '30-40 min a intensidad baja-moderada (zona 2): puedes mantener una conversación y respirar por la nariz casi todo el rato. Cinta inclinada, bici, elíptica, remo o caminar rápido. Mejora la recuperación y el corazón sin quitarle energía a las pesas.' },

    // Pierna: rodilla dominante
    'Sentadilla': { videos: [{ url: 'https://www.youtube.com/watch?v=qsAkuNORgmk', label: 'Técnica · Jeremy Ethier' }], group: 'Pierna', type: 'weight', subs: ['Sentadilla goblet', 'Prensa', 'Sentadilla hack'],
      howto: 'Barra sobre los trapecios, codos hacia abajo. Pies a la anchura de los hombros o algo más, puntas un poco abiertas. Coge aire, aprieta el abdomen como si fueran a darte un golpe (bracing) y baja sentándote entre los talones, con las rodillas en la dirección de los pies. Baja al menos hasta muslo paralelo si tu movilidad lo permite, sin que la pelvis se meta hacia dentro abajo. Sube empujando el suelo: pecho y cadera suben a la vez.' },
    'Sentadilla goblet': { group: 'Pierna', type: 'weight',
      howto: 'Mancuerna o kettlebell pegada al pecho. Baja entre las piernas con el tronco muy vertical y los codos por dentro de las rodillas. Es la mejor forma de aprender a sentarse profundo con la espalda neutra.' },
    'Prensa': { group: 'Pierna', type: 'weight', subs: ['Sentadilla hack', 'Sentadilla goblet'],
      howto: 'Espalda y cadera pegadas al respaldo todo el recorrido. Pies a la anchura de los hombros en el centro de la plataforma. Baja hasta ~90º de rodilla o algo más, sin que la cadera se despegue ni la lumbar se redondee. Empuja con todo el pie y no bloquees las rodillas arriba.' },
    'Sentadilla hack': { group: 'Pierna', type: 'weight',
      howto: 'Espalda pegada al respaldo y pies a media plataforma. Baja controlado hasta ~90º o más y sube sin bloquear las rodillas. Muy estable: ideal para apurar las repeticiones sin preocuparte del equilibrio.' },
    'Sentadilla búlgara': { videos: [{ url: 'https://www.youtube.com/shorts/5gRn1lr8vYk', label: 'Técnica · Jeremy Ethier' }], group: 'Pierna', type: 'weight', subs: ['Zancadas', 'Step-ups'],
      howto: 'Empeine trasero sobre un banco, a unos dos pasos. Baja en vertical hasta que la rodilla de atrás casi toque el suelo, con el peso en el talón delantero y el tronco un poco inclinado (así trabaja más el glúteo). La rodilla delantera sigue la línea del pie. Empieza por la pierna más débil y haz lo mismo con la otra.' },
    'Zancadas': { group: 'Pierna', type: 'weight',
      howto: 'Pasos largos alternando piernas, con una mancuerna en cada mano. La rodilla de atrás casi toca el suelo y el tronco va erguido. Empuja con el talón delantero para avanzar.' },
    'Step-ups': { group: 'Pierna', type: 'weight',
      howto: 'Sube a un banco o cajón (rodilla a ~90º) empujando solo con la pierna de arriba, sin impulsarte con la de abajo. Baja controlado. Con mancuernas cuando te resulte fácil.' },

    // Pierna: bisagra de cadera y cadena posterior
    'Peso muerto': { videos: [{ url: 'https://www.youtube.com/watch?v=7Sjfm61-HC4', label: 'Técnica · Jeremy Ethier' }], group: 'Pierna', type: 'weight', subs: ['Peso muerto trap bar', 'Peso muerto rumano'],
      howto: 'Pies a la anchura de la cadera, barra sobre el medio del pie. Agarra justo por fuera de las piernas y baja la cadera hasta que las espinillas toquen la barra. Pecho arriba, espalda neutra y dorsales activos («esconde las axilas»). Coge aire, aprieta el abdomen y empuja el suelo con las piernas: la barra sube pegada al cuerpo. Arriba, cadera estirada sin echarte hacia atrás. Baja por el mismo camino y empieza cada repetición desde parado.' },
    'Peso muerto trap bar': { group: 'Pierna', type: 'weight',
      howto: 'Colócate dentro de la barra, con los agarres neutros a los lados. Es más vertical que el convencional: trabaja más el cuádriceps y exige menos a la lumbar. Los mismos pasos: aire, abdomen firme y empuja el suelo.' },
    'Peso muerto rumano': { videos: [{ url: 'https://www.youtube.com/shorts/8qNrTuZ0rXM', label: 'Técnica · ATHLEAN-X' }], group: 'Pierna', type: 'weight', subs: ['Peso muerto rumano con mancuernas', 'Hiperextensión en banco'],
      howto: 'De pie con la barra, rodillas un poco flexionadas y fijas. Lleva la cadera atrás deslizando la barra pegada a los muslos hasta notar tensión fuerte en los isquios (suele ser justo bajo la rodilla). Espalda neutra todo el recorrido. Sube empujando la cadera adelante y apretando el glúteo, sin arquear la lumbar arriba.' },
    'Peso muerto rumano con mancuernas': { group: 'Pierna', type: 'weight',
      howto: 'Igual que con barra: mancuernas pegadas a los muslos, cadera atrás y rodillas fijas. Útil si la barra está ocupada o para aprender el movimiento.' },
    'Hiperextensión en banco': { group: 'Glúteo', type: 'weight',
      howto: 'En el banco de 45º, con la cadera justo en el borde del apoyo. Baja doblando por la cadera con la espalda neutra y sube apretando el glúteo hasta quedar en línea, sin arquear la lumbar. Añade un disco al pecho cuando 15 repeticiones te sobren.' },
    'Hip thrust': { videos: [{ url: 'https://www.youtube.com/shorts/WUDVZPTHUhU', label: 'Técnica · Jeremy Ethier' }], group: 'Glúteo', type: 'weight', subs: ['Puente de glúteo', 'Hiperextensión en banco'],
      howto: 'Espalda alta apoyada en el banco (el borde justo bajo las escápulas) y barra sobre la cadera con almohadilla. Pies a la anchura de la cadera, con las espinillas verticales arriba. Empuja con los talones hasta que el tronco quede paralelo al suelo, barbilla recogida y costillas abajo. Aprieta el glúteo 1-2 s sin arquear la lumbar.' },
    'Puente de glúteo': { group: 'Glúteo', type: 'weight',
      howto: 'Tumbado en el suelo con la barra sobre la cadera. Menos recorrido que el hip thrust, pero muy buen sustituto si no hay banco libre. Aprieta 2 s arriba.' },
    'Femoral tumbado': { group: 'Pierna', type: 'weight', subs: ['Femoral sentado', 'Peso muerto rumano'],
      howto: 'Tumbado boca abajo, rodillas justo fuera del borde del banco y el rodillo sobre los tobillos. Flexiona hasta ~90º o más sin levantar la cadera, aguanta 1 s y baja en 3 s: la bajada es donde más trabaja.' },
    'Femoral sentado': { group: 'Pierna', type: 'weight',
      howto: 'El mismo gesto sentado. Como el isquio trabaja estirado, suele dar incluso mejor resultado. Ajusta el respaldo para que la rodilla quede alineada con el eje de la máquina.' },
    'Gemelos': { group: 'Pierna', type: 'weight', subs: ['Gemelos en prensa'],
      howto: 'Elevación de talones de pie (en máquina, en un escalón con mancuerna o en la prensa). Baja hasta estirar del todo, pausa 1 s abajo y sube lo más alto que puedas, con las rodillas estiradas. Sin rebotes.' },
    'Gemelos en prensa': { group: 'Pierna', type: 'weight',
      howto: 'En la prensa, con solo la punta de los pies en el borde bajo de la plataforma. Estira del todo abajo y empuja con los dedos. Rodillas estiradas pero sin bloquear.' },

    // Pecho
    'Press banca': { videos: [{ url: 'https://www.youtube.com/shorts/Sb4y8gASMNk', label: 'Técnica · Jeremy Ethier' }], group: 'Pecho', type: 'weight', subs: ['Press con mancuernas', 'Press de pecho en máquina', 'Flexiones'],
      howto: 'Tumbado con los ojos bajo la barra. Junta las escápulas y llévalas hacia abajo, con un ligero arco en la espalda alta, el glúteo en el banco y los pies firmes. Agarre algo más ancho que los hombros y muñecas rectas. Baja controlado hasta la parte baja del pecho, con los codos a unos 45-70º del cuerpo (nunca en cruz), y empuja hacia arriba y un poco hacia atrás. Con peso serio, usa los topes de seguridad o pide que te ayuden.' },
    'Press con mancuernas': { group: 'Pecho', type: 'weight',
      howto: 'Más recorrido que con barra, y cada brazo trabaja por su cuenta. Escápulas atrás y abajo. Baja hasta que las mancuernas lleguen a los lados del pecho y sube sin chocarlas.' },
    'Press de pecho en máquina': { group: 'Pecho', type: 'weight',
      howto: 'Ajusta el asiento para que los agarres queden a la altura del medio del pecho y pega las escápulas al respaldo. Muy buena opción para apurar las series sin ayudante.' },
    'Flexiones': { group: 'Pecho', type: 'reps',
      howto: 'Manos algo más anchas que los hombros, cuerpo en bloque (glúteo y abdomen apretados) y codos a unos 45º. Baja hasta casi tocar el suelo con el pecho. Si te salen más de 20, pon los pies en alto o usa lastre.' },
    'Press inclinado con mancuernas': { videos: [{ url: 'https://www.youtube.com/watch?v=tXmgIuNO-3o', label: 'Técnica · Trainologym' }], group: 'Pecho', type: 'weight', subs: ['Press inclinado en máquina', 'Press inclinado con barra'],
      howto: 'Banco a 30º (con más inclinación trabaja sobre todo el hombro). Escápulas atrás y abajo. Baja las mancuernas a los lados del pecho con los codos a unos 45º y sube acercándolas sin chocarlas.' },
    'Press inclinado en máquina': { group: 'Pecho', type: 'weight',
      howto: 'Asiento a la altura en la que los agarres queden a la altura de la parte alta del pecho. Escápulas pegadas al respaldo y empuje controlado.' },
    'Press inclinado con barra': { group: 'Pecho', type: 'weight',
      howto: 'Banco a 30º. Baja la barra a la parte alta del pecho, con los codos algo por debajo de la barra, y empuja en línea recta.' },

    // Espalda
    'Remo con barra': { videos: [{ url: 'https://www.youtube.com/shorts/BMVeFJVh59A', label: 'Errores · ATHLEAN-X' }], group: 'Espalda', type: 'weight', subs: ['Remo con apoyo en pecho', 'Remo con mancuerna', 'Remo sentado'],
      howto: 'Inclínate doblando por la cadera hasta unos 45º, con la espalda neutra y las rodillas algo flexionadas. Tira de la barra hacia el ombligo llevando los codos atrás y juntando las escápulas, y baja controlado sin perder la postura. Si la lumbar se queja, sobre todo cerca del día de peso muerto, cámbialo por el remo con apoyo en el pecho.' },
    'Remo con apoyo en pecho': { group: 'Espalda', type: 'weight',
      howto: 'Boca abajo en un banco inclinado, o en una máquina con apoyo. Como no tienes que sujetar el tronco, la lumbar descansa y todo el esfuerzo va a la espalda. Tira con los codos, junta las escápulas y baja estirando del todo.' },
    'Remo con mancuerna': { group: 'Espalda', type: 'weight',
      howto: 'Rodilla y mano en el banco, con la espalda plana. Tira de la mancuerna hacia la cadera (no hacia el hombro) y baja estirando para notar el dorsal.' },
    'Remo sentado': { group: 'Espalda', type: 'weight', subs: ['Remo en máquina', 'Remo con mancuerna'],
      howto: 'Sentado, con el pecho alto y las rodillas un poco flexionadas. Tira del agarre hacia el ombligo con los codos pegados al cuerpo y junta las escápulas. Vuelve estirando los brazos y deja que las escápulas se separen, sin balancear el tronco.' },
    'Remo en máquina': { group: 'Espalda', type: 'weight',
      howto: 'Pecho contra el apoyo y agarre a la altura del ombligo. Tira con los codos y junta las escápulas; vuelve controlado hasta estirar.' },
    'Dominadas': { videos: [{ url: 'https://www.youtube.com/watch?v=jYbNXmbErt8', label: 'De 0 a 10 · Jeremy Ethier' }], group: 'Espalda', type: 'reps', subs: ['Dominadas asistidas', 'Jalón al pecho', 'Negativas de dominada'],
      howto: 'Agarre prono algo más ancho que los hombros (supino si quieres más bíceps). Empieza colgado con los brazos estirados, baja y junta los hombros y tira llevando los codos hacia las costillas hasta pasar la barbilla. Baja controlado hasta estirar del todo. Si no llegas a 6, hazlas asistidas; si pasas de 10, añade lastre.' },
    'Dominadas asistidas': { group: 'Espalda', type: 'weight',
      howto: 'En máquina asistida o con goma. Elige la asistencia justa para completar las repeticiones con buena técnica y ve reduciéndola semana a semana.' },
    'Jalón al pecho': { group: 'Espalda', type: 'weight',
      howto: 'Agarre algo más ancho que los hombros, pecho alto y ligera inclinación hacia atrás. Tira de la barra hacia la parte alta del pecho llevando los codos abajo y atrás, y sube controlado hasta estirar los brazos.' },
    'Negativas de dominada': { group: 'Espalda', type: 'reps',
      howto: 'Sube a la posición de arriba con un salto o un cajón, con la barbilla por encima de la barra, y baja lo más lento que puedas (4-6 s). Es el puente hacia tu primera dominada.' },

    // Hombro
    'Press militar': { videos: [{ url: 'https://www.youtube.com/watch?v=4I6gCfiIHlw', label: 'Guía · Fit Generation' }], group: 'Hombro', type: 'weight', subs: ['Press militar con mancuernas', 'Press de hombro en máquina', 'Landmine press'],
      howto: 'De pie, barra a la altura de las clavículas, agarre algo más ancho que los hombros y antebrazos verticales. Glúteo y abdomen apretados para no arquear la espalda. Empuja la barra en línea recta apartando la cara y, cuando pase la frente, mete la cabeza «por la ventana» hasta bloquear arriba con la barra sobre el medio del pie.' },
    'Press militar con mancuernas': { group: 'Hombro', type: 'weight',
      howto: 'Sentado con respaldo o de pie. Mancuernas a la altura de las orejas y codos un poco por delante del cuerpo. Empuja hacia arriba sin arquear la lumbar.' },
    'Press de hombro en máquina': { group: 'Hombro', type: 'weight',
      howto: 'Ajusta el asiento para que los agarres queden a la altura de los hombros. Espalda pegada al respaldo y empuje controlado sin bloquear los codos de golpe.' },
    'Landmine press': { group: 'Hombro', type: 'weight',
      howto: 'Barra anclada en una esquina o en un soporte. Empuja el extremo hacia arriba y adelante con una mano: el recorrido en diagonal es muy amable con el hombro.' },
    'Elevación lateral': { videos: [{ url: 'https://www.youtube.com/shorts/5ah-7uqsIZU', label: 'Técnica · Jeremy Ethier' }], group: 'Hombro', type: 'weight', subs: ['Elevación lateral en polea'],
      howto: 'Mancuernas a los lados y el cuerpo un poco inclinado hacia delante. Sube los brazos hasta la altura de los hombros, con los codos apenas flexionados y ligeramente por delante del cuerpo. Baja en 2-3 s. Si tienes que balancearte, sobra peso.' },
    'Elevación lateral en polea': { group: 'Hombro', type: 'weight',
      howto: 'Elevación lateral con la polea baja por delante del cuerpo. La polea mantiene la tensión también abajo. Ligero y controlado.' },
    'Face pull': { group: 'Hombro', type: 'weight', subs: ['Pájaro', 'Aperturas con banda'],
      howto: 'Polea a la altura de la cara y cuerda con agarre neutro. Tira hacia la frente separando las manos y girando los antebrazos hacia arriba, con los codos altos. Aguanta 1 s y vuelve controlado. Ligero y estricto: es salud del hombro, no fuerza bruta.' },
    'Pájaro': { group: 'Hombro', type: 'weight',
      howto: 'Inclinado hacia delante con la espalda plana, abre los brazos hacia los lados con los codos un poco flexionados, llevando el movimiento con la parte de atrás del hombro. Muy ligero.' },
    'Aperturas con banda': { group: 'Hombro', type: 'reps',
      howto: 'Banda a la altura del pecho con los brazos estirados. Ábrela hasta que toque el pecho juntando las escápulas. Perfecta para casa o para calentar.' },

    // Brazos
    'Curl con barra': { group: 'Bíceps', type: 'weight', subs: ['Curl con mancuernas', 'Curl en polea'],
      howto: 'De pie y con los codos pegados al cuerpo. Sube la barra sin adelantar los codos ni balancear el tronco, aprieta arriba y baja en 2-3 s hasta estirar.' },
    'Curl con mancuernas': { group: 'Bíceps', type: 'weight',
      howto: 'Alternando brazos o a la vez, girando la palma hacia arriba mientras subes. Codos quietos junto al cuerpo.' },
    'Curl en polea': { group: 'Bíceps', type: 'weight',
      howto: 'Polea baja con cuerda. La tensión constante de la polea hace que cada repetición cuente de principio a fin.' },
    'Extensión de tríceps en polea': { group: 'Tríceps', type: 'weight', subs: ['Extensión de tríceps sobre la cabeza', 'Press francés'],
      howto: 'Polea alta con cuerda y codos pegados a los costados. Estira los brazos separando la cuerda abajo y vuelve hasta ~90º sin despegar los codos.' },
    'Extensión de tríceps sobre la cabeza': { group: 'Tríceps', type: 'weight',
      howto: 'De espaldas a la polea, con la cuerda por detrás de la cabeza. Estira los brazos hacia delante y arriba: con el brazo por encima de la cabeza trabaja la cabeza larga del tríceps.' },
    'Press francés': { group: 'Tríceps', type: 'weight',
      howto: 'Tumbado, mancuernas sobre los hombros. Dobla solo los codos hasta llevarlas junto a la cabeza y estira sin mover los brazos.' },

    // Core
    'Plancha frontal': { group: 'Core', type: 'time', metrics: [], subs: ['Dead bug', 'Rueda abdominal'],
      howto: 'Antebrazos bajo los hombros y cuerpo en línea de la cabeza a los talones. Aprieta glúteo y abdomen y mete un poco la pelvis. Respira sin soltar la tensión. Cuando aguantes 45 s con técnica perfecta, pasa a plancha con toques de hombro o con peso.' },
    'Dead bug': { group: 'Core', type: 'reps',
      howto: 'Boca arriba, con los brazos al techo y las rodillas a 90º. Pega la lumbar al suelo y estira a la vez un brazo y la pierna contraria sin que la espalda se despegue. Lento: unos 3 s por repetición.' },
    'Rueda abdominal': { group: 'Core', type: 'reps',
      howto: 'De rodillas, rueda hacia delante con el glúteo apretado y la pelvis metida, y vuelve antes de que la lumbar se hunda. Aumenta el recorrido poco a poco.' },
    'Pallof press': { group: 'Core', type: 'time', metrics: [], subs: ['Plancha lateral'],
      howto: 'De lado a la polea, que está a la altura del pecho. Lleva el agarre al esternón y estira los brazos al frente sin dejar que la polea te gire: el abdomen trabaja resistiendo la rotación. Aguanta con los brazos estirados el tiempo indicado y cambia de lado.' },
    'Plancha lateral': { group: 'Core', type: 'time', metrics: [],
      howto: 'Apoyado en un antebrazo, con el cuerpo en línea y la cadera alta. Aguanta sin dejar que la cadera caiga. Para hacerla más fácil, apoya la rodilla de abajo.' },
    'Paseo del granjero': { videos: [{ url: 'https://www.youtube.com/watch?v=8DBHNgT1zO8', label: 'Técnica · HSN' }], group: 'Core', type: 'time', metrics: ['weight', 'distance'], subs: ['Aguante con mancuernas'],
      howto: 'Una mancuerna o kettlebell pesada en cada mano, hombros abajo y atrás, tronco erguido. Camina con pasos cortos y firmes sin dejar que el cuerpo se incline. Trabaja agarre, core y postura a la vez.' },
    'Aguante con mancuernas': { group: 'Agarre', type: 'time', metrics: ['weight'],
      howto: 'De pie y quieto, con una mancuerna pesada en cada mano y la postura del paseo del granjero. Aguanta el tiempo indicado sin encoger los hombros.' },
  };

  // ---------- Ayudas para escribir los días ----------
  // ex(nombre, series, { rir, rest, note, priority, optional })
  const ex = (name, sets, o = {}) => ({
    name, sets,
    label: o.rir || undefined,
    notes: [o.rest ? `Descanso ${o.rest}` : '', o.note || ''].filter(Boolean).join(' · ') || undefined,
    priority: !!o.priority, optional: !!o.optional,
  });
  const block = (label, exercises, optional = false) => ({ label, optional, exercises });
  const rest = (name) => ({ name, type: 'rest', typeLabel: 'Descanso', isRest: true, focus: 'Recuperación', blocks: [], planB: [] });
  const REGLAS_CARGA = [
    { orig: 'Te sobran 2+ reps del rango', sub: 'Sube la carga la próxima sesión (2,5 kg barra · 1-2 kg mancuerna)' },
    { orig: 'No llegas al mínimo del rango', sub: 'Baja un 5-10 % y vuelve a subir (el descanso no se alarga)' },
  ];

  // =====================================================================
  // FULL BODY CLÁSICO · 3 DÍAS
  // =====================================================================
  const fullBody = {
    id: 'full-body-clasico',
    name: 'Full body clásico',
    tagline: 'Todo el cuerpo, tres días por semana. La base con la que mejor se progresa.',
    level: 'Principiante · intermedio',
    frequency: '3 días/semana',
    sessionTime: '60-70 min',
    equipment: 'Gimnasio (barra, mancuernas, poleas)',
    goal: 'Fuerza general y masa muscular',
    highlights: [
      'Cada músculo, 2-3 veces por semana',
      'Tres sesiones distintas (A, B y C) que se complementan',
      'Técnica, descansos, RIR y 2-3 alternativas en cada ejercicio',
      'Plan B para cada día y 5 guías: progresión, técnica, calentamiento…',
    ],
    days: [
      {
        name: 'Lunes', type: 'strong', typeLabel: 'Día fuerte', duration: '≈ 60 min',
        focus: 'Full body A · Sentadilla y press banca',
        blocks: [
          block('Calentamiento', [
            ex('Cardio suave', '5 min'),
            ex('Movilidad general', ''),
            ex('Activación de glúteos', ''),
          ]),
          block('Pierna', [
            ex('Sentadilla', '4×6-8', { rir: 'RIR 2', rest: '2-3 min', note: 'Antes, 2-3 series de aproximación', priority: true }),
          ]),
          block('Pecho', [
            ex('Press banca', '4×6-8', { rir: 'RIR 2', rest: '2-3 min', note: 'Aproximación como en la sentadilla', priority: true }),
          ]),
          block('Espalda', [
            ex('Remo con barra', '3×8-10', { rir: 'RIR 1-2', rest: '2 min', note: 'Tronco fijo, sin tirones' }),
          ]),
          block('Pierna', [
            ex('Peso muerto rumano', '3×8-10', { rir: 'RIR 2', rest: '2 min', note: 'Baja en 3 s' }),
          ]),
          block('Hombro', [
            ex('Elevación lateral', '3×12-15', { rir: 'RIR 1', rest: '1 min', note: 'Baja en 2-3 s' }),
          ]),
          block('Core', [
            ex('Plancha frontal', '3×30-45 s', { rest: '45 s', note: 'Glúteo y abdomen apretados' }),
          ]),
          block('Estiramientos', [
            ex('Estiramientos', ''),
          ]),
        ],
        planB: [
          { orig: 'Rack de sentadilla ocupado', sub: 'Prensa o sentadilla goblet pesada, mismas series' },
          { orig: 'Banco ocupado', sub: 'Press con mancuernas en banco plano' },
          { orig: 'Molestia lumbar', sub: 'Remo con apoyo en pecho e hiperextensión en banco en vez de rumano' },
          { orig: 'Solo tienes 40 min', sub: 'Sentadilla, banca y remo a 3 series; fuera laterales' },
          ...REGLAS_CARGA,
        ],
        relatedGuides: ['fb-como-funciona', 'fb-calentamiento', 'fb-tecnica'],
      },
      rest('Martes'),
      {
        name: 'Miércoles', type: 'strong', typeLabel: 'Día fuerte', duration: '≈ 65 min',
        focus: 'Full body B · Peso muerto y press militar',
        blocks: [
          block('Calentamiento', [
            ex('Cardio suave', '5 min'),
            ex('Movilidad general', ''),
            ex('Activación de escápulas', ''),
          ]),
          block('Pierna', [
            ex('Peso muerto', '3×5', { rir: 'RIR 2-3', rest: '3 min', note: 'Aproximación progresiva · Cada rep desde parado', priority: true }),
          ]),
          block('Hombro', [
            ex('Press militar', '4×6-8', { rir: 'RIR 2', rest: '2-3 min', note: 'Glúteo apretado, sin arquear', priority: true }),
          ]),
          block('Espalda', [
            ex('Dominadas', '4×6-10', { rir: 'RIR 1-2', rest: '2 min', note: 'Asistidas o jalón si no llegas a 6' }),
          ]),
          block('Pierna', [
            ex('Sentadilla búlgara', '3×8-10', { rir: 'RIR 2', rest: '1:30 min', note: 'Por pierna · Empieza por la más débil' }),
          ]),
          block('Hombro', [
            ex('Face pull', '3×15', { rir: 'RIR 2', rest: '1 min', note: 'Ligero y estricto' }),
          ]),
          block('Bíceps', [
            ex('Curl con barra', '3×10-12', { rir: 'RIR 1', rest: '1 min', note: 'Si vas justo de tiempo, fuera', optional: true }),
          ]),
          block('Core', [
            ex('Pallof press', '3×20-30 s', { rest: '45 s', note: 'Por lado · Que la polea no te gire' }),
          ]),
          block('Estiramientos', [
            ex('Estiramientos', ''),
          ]),
        ],
        planB: [
          { orig: 'Aún no haces 6 dominadas', sub: 'Dominadas asistidas o jalón al pecho, 4×8-10' },
          { orig: 'Molestia de hombro en el press', sub: 'Landmine press o press militar con mancuernas sentado' },
          { orig: 'Sin plataforma para peso muerto', sub: 'Peso muerto trap bar o rumano 3×6-8' },
          { orig: 'Molestia lumbar', sub: 'Hip thrust 4×8 en vez de peso muerto' },
          { orig: 'Solo tienes 40 min', sub: 'Peso muerto, militar y dominadas; fuera face pull y curl' },
          ...REGLAS_CARGA,
        ],
        relatedGuides: ['fb-como-funciona', 'fb-progresion', 'fb-tecnica'],
      },
      rest('Jueves'),
      {
        name: 'Viernes', type: 'moderate', typeLabel: 'Día moderado', duration: '≈ 60 min',
        focus: 'Full body C · Volumen y cadena posterior',
        blocks: [
          block('Calentamiento', [
            ex('Cardio suave', '5 min'),
            ex('Movilidad general', ''),
            ex('Activación de glúteos', ''),
          ]),
          block('Pierna', [
            ex('Prensa', '3×10-12', { rir: 'RIR 1-2', rest: '2 min', note: 'Cadera pegada al respaldo', priority: true }),
          ]),
          block('Pecho', [
            ex('Press inclinado con mancuernas', '3×8-12', { rir: 'RIR 1-2', rest: '2 min', note: 'Banco a 30º', priority: true }),
          ]),
          block('Espalda', [
            ex('Remo sentado', '3×10-12', { rir: 'RIR 1-2', rest: '1:30 min', note: 'Pecho alto, sin balanceo' }),
          ]),
          block('Glúteo', [
            ex('Hip thrust', '3×8-12', { rir: 'RIR 1-2', rest: '1:30 min', note: 'Aguanta 1-2 s arriba' }),
          ]),
          block('Pierna', [
            ex('Femoral tumbado', '3×10-12', { rir: 'RIR 1', rest: '1 min', note: 'Baja en 3 s' }),
            ex('Gemelos', '3×12-15', { rir: 'RIR 1', rest: '1 min', note: 'Pausa 1 s abajo', optional: true }),
          ]),
          block('Tríceps', [
            ex('Extensión de tríceps en polea', '2×12-15', { rir: 'RIR 1', rest: '1 min', optional: true }),
          ]),
          block('Core', [
            ex('Paseo del granjero', '3×30-40 m', { rest: '1 min', note: 'Lo más pesado que lleves erguido' }),
          ]),
          block('Estiramientos', [
            ex('Estiramientos', ''),
          ]),
        ],
        planB: [
          { orig: 'Prensa ocupada', sub: 'Sentadilla hack o goblet, mismas series' },
          { orig: 'Sin banco para hip thrust', sub: 'Puente de glúteo en el suelo' },
          { orig: 'Piernas cargadas del miércoles', sub: 'Prensa con RIR 3 y sin apurar el femoral' },
          { orig: 'Solo tienes 40 min', sub: 'Salta los opcionales y deja 2 series en remo, hip thrust y femoral' },
          ...REGLAS_CARGA,
        ],
        relatedGuides: ['fb-como-funciona', 'fb-progresion', 'fb-adaptar'],
      },
      {
        name: 'Sábado', type: 'light', typeLabel: 'Día ligero', duration: '30-45 min',
        focus: 'Opcional · Cardio Z2 y movilidad',
        blocks: [
          block('Calentamiento', [
            ex('Movilidad general', ''),
          ], true),
          block('Cardio', [
            ex('Cardio Z2', '30-40 min', { note: 'Puedes hablar mientras lo haces' }),
          ], true),
          block('Estiramientos', [
            ex('Estiramientos', ''),
          ], true),
        ],
        planB: [
          { orig: 'Semana muy cargada', sub: 'Descansa: este día es un extra, no una obligación' },
          { orig: 'Llueve o no hay máquinas', sub: 'Camina rápido 40 min' },
        ],
        relatedGuides: ['fb-como-funciona'],
      },
      rest('Domingo'),
    ],

    // ---------- Guías de la plantilla ----------
    guides: [
      {
        id: 'fb-como-funciona', number: '01', title: 'Cómo funciona esta plantilla',
        summary: 'La estructura A/B/C, por qué full body y el volumen de cada músculo',
        content: `
        <p class="lead">Tres sesiones de cuerpo completo por semana, cada una distinta. Entrenar cada músculo 2-3 veces por semana con un volumen moderado es de lo que mejor funciona para ganar fuerza y músculo, sobre todo en tus primeros años de entrenamiento. Además, si un día fallas, no se queda ningún músculo sin trabajar esa semana.</p>

        <h3>Las tres sesiones</h3>
        <table>
          <tr><th>Día</th><th>Principal</th><th>Idea</th></tr>
          <tr><td>A · Lunes</td><td>Sentadilla + press banca</td><td>Fuerza: rangos de 6-8</td></tr>
          <tr><td>B · Miércoles</td><td>Peso muerto + press militar</td><td>Fuerza + tirón vertical y unilateral</td></tr>
          <tr><td>C · Viernes</td><td>Prensa + press inclinado</td><td>Volumen: rangos de 8-12 y cadena posterior</td></tr>
        </table>
        <p>Martes, jueves y domingo son de descanso. El sábado es un extra opcional (cardio suave y movilidad) que ayuda a recuperar. Puedes mover la semana (martes, jueves y sábado, por ejemplo) siempre que dejes <strong>al menos un día libre entre sesiones</strong>.</p>

        <h3>Todos los patrones de movimiento</h3>
        <p>Cada semana entrenas todos los gestos básicos del cuerpo, así no queda ninguna zona débil:</p>
        <table>
          <tr><th>Patrón</th><th>Ejercicios</th></tr>
          <tr><td>Rodilla dominante</td><td>Sentadilla (A), búlgara (B), prensa (C)</td></tr>
          <tr><td>Bisagra de cadera</td><td>Rumano (A), peso muerto (B), hip thrust y femoral (C)</td></tr>
          <tr><td>Empuje horizontal</td><td>Press banca (A), press inclinado (C)</td></tr>
          <tr><td>Empuje vertical</td><td>Press militar (B)</td></tr>
          <tr><td>Tirón horizontal</td><td>Remo con barra (A), remo en polea (C)</td></tr>
          <tr><td>Tirón vertical</td><td>Dominadas (B)</td></tr>
          <tr><td>Core</td><td>Anti-extensión (plancha), anti-rotación (Pallof) y acarreo (granjero)</td></tr>
        </table>

        <h3>Series por semana y músculo</h3>
        <table>
          <tr><th>Músculo</th><th>Series efectivas</th></tr>
          <tr><td>Cuádriceps</td><td>10</td></tr>
          <tr><td>Isquios y glúteo</td><td>12 (más lo que trabajan en sentadillas)</td></tr>
          <tr><td>Pecho</td><td>7</td></tr>
          <tr><td>Espalda</td><td>13 (con face pull)</td></tr>
          <tr><td>Hombro</td><td>10 (militar, laterales y face pull)</td></tr>
          <tr><td>Bíceps y tríceps</td><td>2-3 directas + todo el trabajo de press y tirón</td></tr>
        </table>
        <p>Hay <strong>más tirón que empuje</strong> a propósito: compensa las horas de ordenador y el móvil, y protege el hombro a largo plazo.</p>

        <h3>El orden importa</h3>
        <p>Cada día está ordenado por partes del cuerpo <strong>en el orden en que se hacen</strong>, por eso una misma categoría (Pierna, por ejemplo) puede salir dos veces.</p>
        <ul>
          <li><strong>Los principales</strong> (en rojo) van primero, frescos y con la mejor técnica: son los que más se progresan.</li>
          <li>Después, <strong>el resto de ejercicios grandes</strong>, con algo más de repeticiones.</li>
          <li><strong>Los pequeños y el core</strong> al final. Los opcionales (en cursiva) son los primeros que se quitan si vas justo.</li>
        </ul>
        <p class="note">Los ejercicios en rojo son los prioritarios del día. El chip de cada ejercicio (RIR 2, RIR 1-2…) te dice cuánto esfuerzo dejar en la recámara; lo explica la guía de progresión.</p>`,
      },
      {
        id: 'fb-progresion', number: '02', title: 'Carga, RIR y cómo progresar',
        summary: 'Cuánto peso poner, cuándo subirlo y qué hacer si te estancas',
        content: `
        <p class="lead">Progresar es hacer un poco más que la última vez: una repetición más o algo más de peso. Traindía te enseña lo que hiciste la sesión anterior en cada ejercicio para que solo tengas que superarlo.</p>

        <h3>RIR: repeticiones en recámara</h3>
        <p>El RIR es cuántas repeticiones más podrías haber hecho con buena técnica al terminar la serie.</p>
        <table>
          <tr><th>RIR</th><th>Sensación</th></tr>
          <tr><td>3</td><td>Cómoda: podrías hacer 3 más</td></tr>
          <tr><td>2</td><td>Exigente, pero sobran 2 con técnica limpia</td></tr>
          <tr><td>1</td><td>Muy dura: solo quedaba 1</td></tr>
          <tr><td>0</td><td>Fallo: no sale ni una más</td></tr>
        </table>
        <p>No hace falta llegar al fallo para progresar. En los ejercicios grandes (sentadilla, peso muerto, press) el fallo cansa mucho y aumenta el riesgo de lesión; con RIR 1-2 consigues casi todo el beneficio.</p>

        <h3>Doble progresión: el método</h3>
        <ul>
          <li>Cada ejercicio tiene un <strong>rango</strong>, por ejemplo 4×6-8.</li>
          <li>Elige un peso con el que hagas el mínimo (6) respetando el RIR.</li>
          <li>Cada sesión intenta sumar repeticiones con ese mismo peso: 6, 7, 7, 8…</li>
          <li>Cuando hagas el <strong>máximo en todas las series</strong> (4×8) con el RIR indicado, sube el peso: 2,5 kg en barra, 1-2 kg por mancuerna. Vuelves al mínimo del rango y repites.</li>
        </ul>
        <table>
          <tr><th>Sesión</th><th>Peso</th><th>Series</th></tr>
          <tr><td>1</td><td>60 kg</td><td>7 · 6 · 6 · 6</td></tr>
          <tr><td>2</td><td>60 kg</td><td>8 · 7 · 7 · 6</td></tr>
          <tr><td>3</td><td>60 kg</td><td>8 · 8 · 8 · 8 → sube</td></tr>
          <tr><td>4</td><td>62,5 kg</td><td>7 · 6 · 6 · 6</td></tr>
        </table>

        <h3>Si te estancas</h3>
        <ul>
          <li>Tres sesiones seguidas sin mejorar en un ejercicio: baja un 10 % y vuelve a subir poco a poco. Suele superarse la marca anterior en 2-3 semanas.</li>
          <li>Si te estancas en varios a la vez, el problema no es el plan: revisa el sueño, la comida (sobre todo proteína) y el estrés.</li>
        </ul>

        <h3>Semana de descarga</h3>
        <p>Cada 6-8 semanas, o antes si notas cansancio acumulado, articulaciones cargadas o que todo pesa más: haz una semana con los mismos ejercicios y pesos, pero con <strong>la mitad de las series</strong> y RIR 3-4. Vuelves con más fuerza.</p>

        <p class="note">Apunta las series en el entreno en vivo de Traindía. En Progreso → Por ejercicio verás la evolución de cada uno, y en Récords tus mejores marcas.</p>`,
      },
      {
        id: 'fb-calentamiento', number: '03', title: 'Calentamiento y series de aproximación',
        summary: 'Diez minutos que te hacen rendir más y lesionarte menos',
        content: `
        <p class="lead">El calentamiento de la plantilla dura unos 10 minutos y tiene tres partes. No es tiempo perdido: con el cuerpo caliente mueves más peso con mejor técnica.</p>

        <h3>1. General (5 min)</h3>
        <p>Cardio suave en la máquina que quieras. Tienes que acabar con algo de calor, no cansado.</p>

        <h3>2. Movilidad y activación (5 min)</h3>
        <ul>
          <li><strong>Movilidad general</strong>: tobillo, cadera, columna y hombro. Viene detallada en la técnica del ejercicio.</li>
          <li><strong>Activación</strong>: glúteo los días de sentadilla o bisagra, y escápulas el día del press militar y las dominadas.</li>
        </ul>

        <h3>3. Series de aproximación</h3>
        <p>Solo en los <strong>dos ejercicios principales</strong> de cada día. Son series ligeras que suben de peso hasta el de trabajo; no cuentan como series del plan y no deben cansarte.</p>
        <table>
          <tr><th>Serie</th><th>Peso (si trabajas con 80 kg)</th><th>Reps</th></tr>
          <tr><td>1</td><td>Barra sola (20 kg)</td><td>8-10</td></tr>
          <tr><td>2</td><td>~50 % · 40 kg</td><td>5</td></tr>
          <tr><td>3</td><td>~70 % · 55-60 kg</td><td>3</td></tr>
          <tr><td>4 (opcional)</td><td>~85 % · 67,5-70 kg</td><td>1-2</td></tr>
        </table>
        <p>Descansa lo justo entre aproximaciones (30-60 s) y 1-2 minutos antes de la primera serie de trabajo.</p>

        <h3>Vuelta a la calma</h3>
        <p>Al terminar, 5-8 minutos de estiramientos suaves. No evitan las agujetas, pero relajan, bajan pulsaciones y ayudan a mantener la movilidad a largo plazo.</p>`,
      },
      {
        id: 'fb-tecnica', number: '04', title: 'Técnica de los básicos',
        summary: 'Las claves de sentadilla, peso muerto, press banca, press militar, remo y dominadas',
        content: `
        <p class="lead">La técnica completa de cada ejercicio está en su ficha (toca el ejercicio durante el entreno). Aquí tienes lo esencial de los seis que más cargan, y el gesto que los une a todos: el bracing.</p>

        <h3>Bracing: el cinturón natural</h3>
        <p>Antes de cada repetición pesada: coge aire hacia la tripa y los costados (no hacia el pecho) y aprieta el abdomen como si fueran a darte un puñetazo. Mantén esa presión durante la repetición y suelta el aire arriba. Protege la espalda y te hace más fuerte.</p>

        <h3>Sentadilla</h3>
        <ul>
          <li>Rodillas en la dirección de las puntas: que no se vayan hacia dentro al subir.</li>
          <li>Todo el pie apoyado; el peso, en el medio del pie.</li>
          <li>Profundidad: la que puedas con la espalda neutra (al menos paralelo).</li>
        </ul>

        <h3>Peso muerto</h3>
        <ul>
          <li>La barra va siempre pegada a las piernas, en línea recta.</li>
          <li>Empuja el suelo con las piernas; no «tires» con la espalda.</li>
          <li>Arriba, glúteo apretado y de pie. No te eches hacia atrás.</li>
        </ul>

        <h3>Press banca</h3>
        <ul>
          <li>Escápulas juntas y abajo antes de sacar la barra, y así toda la serie.</li>
          <li>Codos a 45-70º del cuerpo: en cruz castigan el hombro.</li>
          <li>Pies firmes empujando el suelo.</li>
        </ul>

        <h3>Press militar</h3>
        <ul>
          <li>Glúteo y abdomen apretados: si arqueas la espalda, conviertes el press en un press inclinado y cargas la lumbar.</li>
          <li>La barra sube en línea recta; aparta la cara y mete la cabeza cuando la barra pase la frente.</li>
        </ul>

        <h3>Remo</h3>
        <ul>
          <li>Tira con los codos, no con las manos.</li>
          <li>El tronco no se mueve: si tienes que levantarte para subir la barra, sobra peso.</li>
        </ul>

        <h3>Dominadas</h3>
        <ul>
          <li>Empieza cada repetición bajando y juntando los hombros.</li>
          <li>Recorrido completo: brazos estirados abajo y barbilla por encima arriba.</li>
          <li>Sin balanceo ni patadas.</li>
        </ul>
        <div class="callout"><strong>Dolor no es esfuerzo.</strong> El cansancio y el ardor muscular son normales; el dolor punzante o en una articulación, no. Para, cambia por la alternativa del Plan B y, si se repite, consúltalo con un profesional.</div>`,
      },
      {
        id: 'fb-adaptar', number: '05', title: 'Adaptarla a ti',
        summary: 'Según tu nivel, tu tiempo, tus molestias y el material que tengas',
        content: `
        <p class="lead">La plantilla está pensada para funcionar tal cual, pero se adapta fácil. En Editar día puedes cambiar series y ejercicios, y cada ejercicio tiene alternativas en sus suplentes.</p>

        <h3>Según tu nivel</h3>
        <table>
          <tr><th>Nivel</th><th>Cómo usarla</th></tr>
          <tr><td>Empiezas de cero</td><td>Primeras 3-4 semanas: 3 series en los principales, RIR 3 y pesos con los que aprendas la técnica. Luego, el plan tal cual.</td></tr>
          <tr><td>Menos de 2 años</td><td>Tal cual. Es exactamente para ti.</td></tr>
          <tr><td>Intermedio</td><td>Sube a 4-5 series en los principales y haz siempre los opcionales. Si te estancas, prueba otras plantillas más adelante.</td></tr>
        </table>

        <h3>Si vas justo de tiempo</h3>
        <ul>
          <li>Primero, fuera los <strong>opcionales</strong>.</li>
          <li>Después, deja los secundarios en 2 series.</li>
          <li>Nunca recortes el calentamiento ni los principales.</li>
          <li>¿Solo puedes 2 días? Alterna A y B (semana 1: A-B, semana 2: A-B…) y añade el hip thrust y el remo en polea del día C.</li>
        </ul>

        <h3>Si algo molesta</h3>
        <table>
          <tr><th>Zona</th><th>Cambios</th></tr>
          <tr><td>Hombro</td><td>Press con mancuernas o máquina en vez de barra, landmine en vez de militar, y más face pull</td></tr>
          <tr><td>Lumbar</td><td>Remo con apoyo en pecho, peso muerto trap bar o hip thrust en vez de peso muerto, y prensa en vez de sentadilla</td></tr>
          <tr><td>Rodilla</td><td>Prensa con un recorrido cómodo, step-ups bajos en vez de búlgara, y más femoral y glúteo</td></tr>
        </table>

        <h3>Si no tienes todo el material</h3>
        <table>
          <tr><th>Falta</th><th>Usa</th></tr>
          <tr><td>Barra o rack</td><td>Mancuernas: goblet, press con mancuernas, rumano con mancuernas, remo con mancuerna</td></tr>
          <tr><td>Poleas</td><td>Bandas: aperturas con banda en vez de face pull, plancha lateral en vez de Pallof</td></tr>
          <tr><td>Máquinas</td><td>Búlgara o zancadas en vez de prensa, rumano en vez de femoral</td></tr>
        </table>
        <p class="note">Consejo: cuando cambies un ejercicio de forma fija, cámbialo en Editar día. Así el progreso se guarda en el ejercicio que realmente haces.</p>`,
      },
    ],
  };

  const list = [fullBody];
  return {
    list,
    EXERCISES,
    byId: (id) => list.find(t => t.id === id) || null,
    // Guía de cualquier plantilla por id (para la cabecera y los enlaces).
    guide: (id) => { for (const t of list) { const g = (t.guides || []).find(x => x.id === id); if (g) return g; } return null; },
  };
})();
