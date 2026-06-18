// ============================================================
// DATOS DEL PLAN CNP - FASE 1
// ============================================================

const PLAN_DATA = {
  meta: {
    title: "Plan CNP",
    phase: "Fase 1",
    duration: "8-10 semanas",
    sede: "Basic Fit Córdoba",
    atleta: "168 cm · 60-65 kg"
  },

  days: [
    {
      id: "lunes",
      name: "Lunes",
      type: "strong",
      typeLabel: "Día fuerte",
      focus: "Empuje — Pecho · Hombro · Tríceps",
      place: "Basic Fit",
      duration: "~55 min",
      blocks: [
        {
          label: "Fuerza",
          exercises: [
            { name: "Press banca o mancuerna", sets: "4×6-8" },
            { name: "Press inclinado mancuerna", sets: "3×8-10" },
            { name: "Press militar mancuerna", sets: "3×8-10" },
            { name: "Fondos máquina sentado", sets: "3×8-10" },
            { name: "Tríceps cuerda overhead", sets: "3×10-12" }
          ]
        },
        {
          label: "Cardio",
          exercises: [
            { name: "Cinta Z2 conversacional", sets: "15-20'" }
          ]
        }
      ],
      substitutes: [
        { orig: "Press banca", sub: "press máquina pecho o contractor" },
        { orig: "Press inclinado", sub: "press inclinado máquina" },
        { orig: "Press militar", sub: "press máquina hombro o landmine" },
        { orig: "Fondos máquina", sub: "press francés o JM press" },
        { orig: "Tríceps overhead", sub: "press francés mancuerna o barra Z" },
        { orig: "Cinta", sub: "elíptica o bici Z2" }
      ],
      relatedGuides: ["progresion-dominadas"]
    },
    {
      id: "martes",
      name: "Martes",
      type: "moderate",
      typeLabel: "Día moderado",
      focus: "Pierna",
      place: "Basic Fit",
      duration: "~55 min",
      blocks: [
        {
          label: "Fuerza pierna",
          exercises: [
            { name: "Sentadilla o prensa", sets: "4×6-8" },
            { name: "Peso muerto rumano", sets: "3×8" },
            { name: "Hip thrust", sets: "3×10" },
            { name: "Zancadas o búlgaras", sets: "2×10/p" },
            { name: "Gemelo", sets: "3×12" }
          ]
        },
        {
          label: "Cardio",
          exercises: [
            { name: "Cinta Z2 conversacional", sets: "15-20'" }
          ]
        }
      ],
      substitutes: [
        { orig: "Sentadilla", sub: "prensa, hack squat o goblet" },
        { orig: "Peso muerto rum.", sub: "buenos días o femoral tumbado" },
        { orig: "Hip thrust", sub: "glute bridge o patada glúteo polea" },
        { orig: "Zancadas/búlg.", sub: "step-ups o sentadilla unilateral" },
        { orig: "Gemelo", sub: "gemelo prensa o de pie en step" },
        { orig: "Cinta", sub: "elíptica o bici Z2" }
      ],
      relatedGuides: ["lipedema"]
    },
    {
      id: "miercoles",
      name: "Miércoles",
      type: "strong",
      typeLabel: "Día fuerte",
      focus: "Tirón fuerte — Dominadas · Espalda · Bíceps",
      place: "Basic Fit",
      duration: "~60 min",
      blocks: [
        {
          label: "Prioridad",
          exercises: [
            { name: "Dominadas asistidas prono", sets: "5×3-5", priority: true }
          ]
        },
        {
          label: "Espalda",
          exercises: [
            { name: "Remo con barra", sets: "4×6-8" },
            { name: "Jalón al pecho prono", sets: "3×8-10" },
            { name: "Remo bajo polea", sets: "3×10" }
          ]
        },
        {
          label: "Bíceps + cardio",
          exercises: [
            { name: "Curl bíceps barra", sets: "3×8" },
            { name: "Curl martillo", sets: "2×10" },
            { name: "Cinta Z2 muy suave", sets: "15'" }
          ]
        }
      ],
      substitutes: [
        { orig: "Dominadas asist.", sub: "negativas (5-7s) o jalón pesado" },
        { orig: "Remo barra", sub: "remo mancuerna o pendlay" },
        { orig: "Jalón prono", sub: "jalón neutro o pull-over polea" },
        { orig: "Remo bajo polea", sub: "remo máquina cualquiera" },
        { orig: "Curl barra", sub: "curl mancuerna o predicador" },
        { orig: "Curl martillo", sub: "curl cuerda polea" }
      ],
      relatedGuides: ["progresion-dominadas"]
    },
    {
      id: "jueves",
      name: "Jueves",
      type: "light",
      typeLabel: "Día ligero",
      focus: "Agarre · Antebrazo · Hombro · Core",
      place: "Basic Fit",
      duration: "~50 min",
      blocks: [
        {
          label: "Hombro accesorio",
          exercises: [
            { name: "Elevación lateral", sets: "3×12-15" }
          ]
        },
        {
          label: "Brazo ligero",
          exercises: [
            { name: "Tríceps pushdown cuerda", sets: "3×12" },
            { name: "Curl alterno (sin fallo)", sets: "2×10" }
          ]
        },
        {
          label: "Agarre · antebrazo",
          exercises: [
            { name: "Dead hang prono c/grips", sets: "3× máx", priority: true },
            { name: "Static hold mancuernas", sets: "3×30-45\"" },
            { name: "Curl muñeca lateral polea", sets: "3×12/lado" },
            { name: "Pronosupinación mancuerna de pie", sets: "2×10/lado" }
          ]
        },
        {
          label: "Core + cardio",
          exercises: [
            { name: "Captain's chair (rod./piernas)", sets: "3×10-12" },
            { name: "Crunch máquina abdominal", sets: "3×12" },
            { name: "Pallof press polea", sets: "3×30\"/lado" },
            { name: "Plancha frontal", sets: "2×30-40\"" },
            { name: "Cinta Z2", sets: "20-25'" }
          ]
        }
      ],
      substitutes: [
        { orig: "Elev. lateral", sub: "elev. polea o máquina hombro" },
        { orig: "Dead hang", sub: "colgada en máq. asistencia (sin asist.)" },
        { orig: "Static hold", sub: "colgada de barra simple" },
        { orig: "Curl muñeca lat.", sub: "curl muñeca con barra o mancuerna" },
        { orig: "Captain's chair", sub: "elev. piernas tumbada o colgada barra" },
        { orig: "Crunch máquina", sub: "cable crunch de rodillas" },
        { orig: "Pallof press", sub: "leñador polea o plancha lateral" }
      ],
      relatedGuides: []
    },
    {
      id: "viernes",
      name: "Viernes",
      type: "rest",
      typeLabel: "Descanso",
      focus: "Vida fuera del gimnasio",
      place: "— libre —",
      duration: "—",
      isRest: true
    },
    {
      id: "sabado",
      name: "Sábado",
      type: "strong",
      typeLabel: "Día fuerte",
      focus: "Carrera · Suspensión específica",
      place: "Parque",
      placeAccent: true,
      duration: "~60-75 min",
      blocks: [
        {
          label: "Calentamiento",
          exercises: [
            { name: "Progresivo + movilidad", sets: "10-12'" }
          ]
        },
        {
          label: "Carrera (alterna)",
          exercises: [
            { name: "Sem. impar — 5-6×400m R 1:30-2'", sets: "int." },
            { name: "Sem. par — 1km test o 2×800m", sets: "tempo" }
          ]
        },
        {
          label: "Específico CNP",
          exercises: [
            { name: "Suspensión supina barra parque", sets: "4-5× 80-85%", priority: true }
          ]
        },
        {
          label: "Agilidad opcional",
          optional: true,
          exercises: [
            { name: "5-10-5 con conos", sets: "4 reps", optional: true },
            { name: "Slaloms · salidas · giros", sets: "10'", optional: true }
          ]
        }
      ],
      substitutes: [
        { orig: "Si llueve", sub: "cinta intervalos + susp. otro día" },
        { orig: "Sin barra parque", sub: "suspensión Basic Fit con grips" },
        { orig: "Mala sensación", sub: "solo tempo 1km + susp." },
        { orig: "Sin tiempo", sub: "quitar agilidad, mantener resto" },
        { orig: "Lesión leve pierna", sub: "solo susp. + cinta Z2 30'" }
      ],
      substitutesTitle: "Plan B",
      relatedGuides: ["sabado-completo", "agilidad"]
    },
    {
      id: "domingo",
      name: "Domingo",
      type: "moderate",
      typeLabel: "Día moderado-ligero",
      focus: "Tirón supino · Espalda accesoria",
      place: "Basic Fit",
      duration: "~50 min",
      blocks: [
        {
          label: "Movilidad",
          exercises: [
            { name: "Cadera · dorsal · hombro", sets: "8-10'" }
          ]
        },
        {
          label: "Tirón supino",
          exercises: [
            { name: "Jalón al pecho supino", sets: "4×8-10", priority: true },
            { name: "Remo máquina o sentado", sets: "3×10" },
            { name: "Face pull polea", sets: "3×12" }
          ]
        },
        {
          label: "Core + cardio",
          exercises: [
            { name: "Plancha frontal", sets: "2×20-30\"" },
            { name: "Estiramientos cadera/lumbar", sets: "5-7'" },
            { name: "Cinta Z2 o paseo", sets: "20-25'" }
          ]
        },
        {
          label: "Lipedema",
          exercises: [
            { name: "Drenaje · compresión · frío", sets: "opcional" }
          ]
        }
      ],
      substitutes: [
        { orig: "Jalón supino", sub: "jalón neutro o remo cerrado supino" },
        { orig: "Remo máquina", sub: "remo mancuerna o polea baja" },
        { orig: "Face pull", sub: "pájaro o reverse pec deck" },
        { orig: "Plancha", sub: "plancha rodillas o quitarla" },
        { orig: "Estiramientos", sub: "yoga suave o foam roller" },
        { orig: "Cinta", sub: "paseo aire libre o bici Z2" }
      ],
      relatedGuides: ["movilidad", "lipedema"]
    }
  ],

  guides: [
    {
      id: "sabado-completo",
      number: "01",
      title: "Sábado paso a paso",
      summary: "Calentamiento, carrera, suspensión y agilidad en detalle",
      content: `
        <p class="lead">Tu día más específico para CNP. Vas al parque porque necesitas espacio, suelo plano y barras buenas. Tienes 4 bloques: calentamiento, carrera principal, suspensión específica y agilidad opcional. El orden está pensado para que rindas bien en lo importante y termines con lo accesorio.</p>

        <h3>1. Calentamiento (10-12 min)</h3>
        <p>No es opcional ni se salta. Si entras a hacer intervalos en frío, el primer 400 va mal y aumenta riesgo de lesión.</p>

        <h4>Parte A — Trote progresivo (5-6 min)</h4>
        <ul>
          <li>Empiezas andando rápido 1 minuto.</li>
          <li>Pasas a trote suave (puedes hablar sin esfuerzo) durante 3-4 minutos.</li>
          <li>Subes ligeramente el ritmo el último minuto, sin llegar a esfuerzo.</li>
        </ul>

        <h4>Parte B — Movilidad dinámica (3-4 min)</h4>
        <ul>
          <li>10 rotaciones de tobillo cada lado.</li>
          <li>10 elevaciones de rodilla al pecho andando (knee hugs).</li>
          <li>10 zancadas con rotación de tronco.</li>
          <li>10 patadas al glúteo andando (butt kicks).</li>
          <li>10 swings de pierna adelante-atrás cada lado.</li>
          <li>10 swings de pierna lateral cada lado.</li>
        </ul>

        <h4>Parte C — Activación (2-3 min)</h4>
        <ul>
          <li>30 segundos skipping bajo (rodillas al frente).</li>
          <li>30 segundos skipping alto (rodillas a la altura de cadera).</li>
          <li>30 segundos talones al glúteo.</li>
          <li>2-3 progresiones de 50-60 metros aumentando gradualmente hasta el 80%.</li>
        </ul>
        <p>Después: descanso 1-2 minutos respirando, bebes agua y entras a la sesión principal.</p>

        <h3>2. Carrera principal — alterna por semanas</h3>
        <p>No puedes correr a tope todas las semanas. El plan alterna semanas duras y semanas más controladas.</p>

        <h4>Semanas impares — Intervalos: 5-6 × 400 m</h4>
        <p><strong>Qué son:</strong> correr 400 metros (una vuelta de pista) a un ritmo más rápido que tu objetivo de 1 km, con descanso entre cada repetición.</p>
        <p><strong>Por qué:</strong> entrenar a un ritmo más rápido en distancias cortas hace que el ritmo objetivo del 1 km te resulte más cómodo.</p>
        <ul>
          <li>Distancia: 400 m por repetición.</li>
          <li>Número: 5-6 reps (empieza con 5).</li>
          <li>Ritmo: el de un 1 km bueno o ligeramente más rápido.</li>
          <li>Descanso: 1:30-2 min entre reps, andando o trote suave.</li>
          <li>Las repeticiones deben ser regulares.</li>
        </ul>
        <div class="note">Mide 400 m con app de móvil (Strava, Nike Run Club, Garmin) la primera vez y marca dos puntos. En pista de atletismo, una vuelta exterior son 400 m.</div>

        <h4>Semanas pares — Test 1 km o 2 × 800 m</h4>
        <p><strong>Test 1 km:</strong> al máximo. Es tu marca real. 1 vez al mes.</p>
        <p><strong>2 × 800 m tempo:</strong> ritmo ligeramente más lento que 1 km, pero sostenido. Descanso 3-4 min.</p>

        <h4>Esquema mensual</h4>
        <table>
          <tr><th>Semana</th><th>Sesión</th></tr>
          <tr><td>1 (impar)</td><td>5-6 × 400 m</td></tr>
          <tr><td>2 (par)</td><td>2 × 800 m</td></tr>
          <tr><td>3 (impar)</td><td>5-6 × 400 m</td></tr>
          <tr><td>4 (par)</td><td>Test 1 km</td></tr>
        </table>

        <h3>3. Suspensión supina específica</h3>
        <p><strong>Por qué después de la carrera:</strong> en el examen real harás la suspensión cansada. Entrenarla con fatiga previa es realista.</p>

        <h4>Cómo se hace</h4>
        <ul>
          <li>Barra horizontal del parque a altura adecuada.</li>
          <li>Agarre <strong>supino</strong> (palmas hacia ti).</li>
          <li>Manos a la anchura de los hombros.</li>
          <li>Te cuelgas con brazos en flexión, mentón por encima de la barra.</li>
          <li>Aguantas todo lo que puedas sin que el mentón baje por debajo.</li>
        </ul>

        <h4>Volumen y carga</h4>
        <ul>
          <li>4-5 series.</li>
          <li>Cada serie al 80-85% de tu máximo.</li>
          <li>Descanso entre series: 2-3 minutos completos.</li>
        </ul>
        <div class="note">Cómo medir tu máximo: cada 3-4 semanas haces un test (una sola serie al máximo). Las siguientes 3-4 semanas trabajas al 80-85% de ese tiempo.</div>

        <h3>4. Agilidad opcional (10 min)</h3>
        <p>Bloque que se salta sin culpa si vas justa de tiempo o energía.</p>

        <h4>5-10-5 con conos (test pro-agility)</h4>
        <p><strong>Cómo se monta:</strong> tres marcas en línea recta separadas 5 metros: A — B — C (B en el medio).</p>
        <p><strong>Cómo se hace:</strong></p>
        <ul>
          <li>Te sitúas en B, agachada en posición de salida.</li>
          <li>Sales sprintando hacia A (5 metros), tocas suelo con la mano.</li>
          <li>Cambias dirección 180° y sprintas hacia C (10 metros), tocas suelo.</li>
          <li>Cambias dirección 180° y sprintas de vuelta hasta cruzar B (5 metros).</li>
          <li>Total: 20 metros con dos frenadas y dos reaceleraciones.</li>
        </ul>
        <p><strong>Volumen:</strong> 4 reps, descanso 1-1:30 min. Tiempos de referencia: por debajo de 6 segundos está bien.</p>

        <h4>Slaloms</h4>
        <p>5-6 marcas en línea recta separadas 2-3 metros. Sprint en zigzag pasando por el lado alterno de cada cono. 4-5 reps, descanso 1 min.</p>

        <h4>Salidas</h4>
        <p>Posición de salida con pie adelantado y retrasado, peso adelante. Sales explosiva, paso corto y rápido los primeros 3-5 pasos, luego abres zancada. Sprint 10-15 m. 4-5 reps.</p>

        <h4>Giros</h4>
        <p>Sprint corto 10 m, frenas en seco, cambias 180°, sprint de vuelta 10 m. 4 reps.</p>

        <h4>Combinación recomendada</h4>
        <p>Si haces el bloque entero: salidas → 5-10-5 → slaloms → giros. Si solo tienes tiempo para uno: <strong>5-10-5</strong>.</p>

        <h3>5. Vuelta a la calma (5 min)</h3>
        <p>Camina 3-5 min y haz estiramientos suaves de gemelo, isquio, cuádriceps y cadera.</p>
      `
    },
    {
      id: "movilidad",
      number: "02",
      title: "Movilidad del domingo",
      summary: "Cadera, dorsal y hombro — protocolo completo",
      content: `
        <p class="lead">Después de una semana entrenando, hay zonas que se acortan y se cargan. La movilidad del domingo no es estiramiento profundo ni yoga: son movimientos articulares y estiramientos suaves para devolver rango de movimiento a las zonas más castigadas.</p>

        <h3>Cadera (3-4 min)</h3>
        <p><strong>Por qué:</strong> martes hiciste pierna pesada. Sábado corriste. La cadera acumula tensión en flexores (psoas), glúteo y rotadores.</p>

        <h4>Estiramiento de psoas en zancada</h4>
        <p><strong>Tiempo:</strong> 60-90 segundos cada lado.</p>
        <p>Zancada baja, rodilla de atrás apoyada en el suelo, rodilla delante a 90°. Empujas la cadera hacia delante manteniendo el tronco erguido. Notas estiramiento profundo en la parte delantera de la cadera de la pierna de atrás.</p>

        <h4>Paloma de yoga</h4>
        <p><strong>Tiempo:</strong> 60-90 segundos cada lado.</p>
        <p>Desde cuadrupedia, llevas la rodilla derecha hacia delante por fuera de la mano derecha (espinilla atravesada delante). Pierna izquierda estirada hacia atrás. Te dejas caer hacia delante apoyando codos o pecho. Estira glúteo y rotador externo.</p>
        <div class="note">Si te molesta la rodilla, mete una toalla doblada debajo.</div>

        <h4>Rotación de cadera 90/90</h4>
        <p><strong>Tiempo:</strong> 30-45 segundos cada lado.</p>
        <p>Sentada en el suelo con una pierna delante a 90° y la otra al lado también a 90°. Pasas el tronco al lado contrario y cambias la posición. Movimiento dinámico, suave.</p>

        <h3>Dorsal (2-3 min)</h3>
        <p><strong>Por qué:</strong> miércoles dominadas, jalón, remo. Domingo otra vez tirón supino. La espalda alta y los dorsales se cargan mucho.</p>

        <h4>Colgarte de barra (estiramiento dorsal)</h4>
        <p><strong>Tiempo:</strong> 30-45 segundos.</p>
        <p>Te cuelgas pasivamente de una barra. Brazos estirados, hombros relajados (déjate "caer"). Sin hacer fuerza, solo dejarte colgar. Estira dorsal y descomprime columna.</p>

        <h4>Postura del niño con manos extendidas</h4>
        <p><strong>Tiempo:</strong> 60 segundos.</p>
        <p>De rodillas, sentada en los talones. Llevas el pecho al suelo con los brazos completamente estirados al frente. Notas estiramiento desde las axilas bajando por todo el dorsal. Para más intensidad, lleva las manos hacia un lado.</p>

        <h4>Gato-camello</h4>
        <p><strong>Tiempo:</strong> 60 segundos.</p>
        <p>En cuadrupedia. Inhalas y arqueas la espalda hacia abajo (camello). Exhalas y redondeas hacia arriba (gato). Movimiento lento y fluido.</p>

        <h3>Hombro (2-3 min)</h3>

        <h4>Estiramiento cruzado de hombro</h4>
        <p><strong>Tiempo:</strong> 30-45 segundos cada lado.</p>
        <p>Cruzas el brazo derecho por delante del pecho. Con la mano izquierda tiras hacia ti.</p>

        <h4>Estiramiento sobre cabeza (tríceps)</h4>
        <p><strong>Tiempo:</strong> 30-45 segundos cada lado.</p>
        <p>Brazo derecho arriba, doblas el codo llevando la mano detrás de la cabeza. Con la mano izquierda empujas el codo hacia atrás.</p>

        <h4>Círculos de hombro</h4>
        <p><strong>Tiempo:</strong> 30 segundos.</p>
        <p>10 círculos amplios hacia atrás, 10 hacia delante.</p>

        <h3>Reglas básicas</h3>
        <ul>
          <li>8-10 minutos en total. No cronometres al segundo, ve con calma.</li>
          <li>Si una zona te tira más, pasa más tiempo ahí.</li>
          <li>Respira mientras estiras, sin rebotes.</li>
          <li>Sensación: tirón cómodo o intenso pero soportable. Nunca dolor agudo.</li>
        </ul>
      `
    },
    {
      id: "lipedema",
      number: "03",
      title: "Lipedema",
      summary: "Drenaje linfático, compresión y frío",
      content: `
        <p class="lead">Bloque opcional, solo si lo necesitas ese día. El lipedema funciona por episodios: hay días buenos y días con inflamación, pesadez, dolor sordo. Cuando notes eso, este protocolo ayuda. Si la pierna está fina, no hace falta hacer nada.</p>

        <h3>Drenaje linfático manual (10-15 min)</h3>
        <p>Automasaje muy suave que ayuda al sistema linfático a mover el líquido acumulado. <strong>No es masaje muscular profundo</strong>, es presión muy ligera, casi como una caricia firme.</p>

        <h4>Preparación: abrir ganglios (1 min)</h4>
        <p>Empieza siempre por <strong>arriba</strong>, no por la pierna. El líquido tiene que tener "salida". Con los dedos planos, 10 movimientos circulares en:</p>
        <ul>
          <li>Laterales del cuello.</li>
          <li>Encima de las clavículas.</li>
          <li>Axilas (con la mano contraria).</li>
          <li>Ingle.</li>
        </ul>

        <h4>Pierna: orden importantísimo</h4>
        <p><strong>De arriba abajo, pero masajeando hacia arriba.</strong> Empiezas por la zona cercana al tronco y vas bajando, pero los movimientos siempre van dirigidos hacia el corazón.</p>
        <p>Orden: muslo arriba → muslo medio → muslo bajo → rodilla → pantorrilla arriba → pantorrilla baja → tobillo → pie.</p>
        <p>5-10 movimientos por zona. Manos planas, presión muy suave (caricia firme).</p>
        <div class="callout"><strong>NO hagas drenaje si:</strong> tienes infección en la piel, fiebre, o trombosis activa. En estos casos no es seguro.</div>

        <h3>Compresión</h3>
        <p>Medias o leggings de compresión que aplican presión graduada (más en tobillo, menos arriba) para ayudar al retorno venoso y linfático.</p>

        <h4>Tipos</h4>
        <p><strong>Médicas:</strong> recetadas por médico vascular, presión específica en mmHg (clase 2 = 20-30 mmHg suele ser lo habitual en lipedema).</p>
        <p><strong>Deportivas:</strong> CEP, Compressport, 2XU. Menos potentes pero útiles para deporte. No sustituyen a las médicas.</p>

        <h4>Cuándo usar</h4>
        <ul>
          <li><strong>Durante deporte:</strong> deportivas el martes y sábado si notas que ayudan.</li>
          <li><strong>Después de deporte:</strong> médicas las horas siguientes si notas pesadez.</li>
          <li><strong>Día a día:</strong> según indicación médica.</li>
        </ul>
        <div class="note">Cómo ponérselas: por la mañana antes de levantarte de la cama, cuando la pierna está menos hinchada.</div>

        <h3>Frío</h3>

        <h4>Ducha fría de pierna (3-5 min)</h4>
        <p>Apuntas el agua fría desde el tobillo hacia arriba. Empiezas suave y bajas temperatura. Si puedes alternar frío-calor (1 min frío, 30 seg templado, 1 min frío) mejor.</p>

        <h4>Bolsas de gel frío</h4>
        <p>Envueltas en una toalla fina (<strong>nunca directo sobre piel</strong>), 10-15 min en zonas cargadas.</p>

        <h4>Baño frío de piernas</h4>
        <p>Cubo grande con agua fría y hielo, piernas hasta media pantorrilla 5-10 min.</p>

        <h4>Cuándo usar frío</h4>
        <ul>
          <li>Después de carrera intensa el sábado.</li>
          <li>Después de pierna el martes si notas pesadez.</li>
          <li>Cualquier día con pierna especialmente inflamada.</li>
        </ul>

        <h4>Cuándo NO usar frío</h4>
        <ul>
          <li>Mala circulación periférica (Raynaud).</li>
          <li>Si te causa dolor en lugar de alivio.</li>
        </ul>

        <h3>Cómo combinar</h3>
        <p>Protocolo típico de domingo si notas pesadez:</p>
        <ul>
          <li>Después del entreno: ducha fría 3-5 min al final.</li>
          <li>Drenaje linfático manual: 10-15 min por la tarde.</li>
          <li>Compresión: medias médicas el resto del día.</li>
        </ul>

        <div class="callout"><strong>Recomendación importante:</strong> ve a un especialista en lipedema (médico vascular, linfedematólogo, fisio especializado) para confirmar grado, recetar medias adecuadas, y enseñarte drenaje personalizado. El plan de entrenamiento respeta el lipedema, pero el manejo médico se sale del entreno y entra en lo clínico.</div>
      `
    },
    {
      id: "progresion-dominadas",
      number: "04",
      title: "Progresión de dominadas",
      summary: "Plan de 8-10 semanas hasta dominada libre",
      content: `
        <p class="lead">Tu objetivo en esta fase es bajar la asistencia de 14 kg a 6-8 kg en 8-10 semanas. La progresión va por subir reps antes de bajar asistencia.</p>

        <h3>Plan semana a semana</h3>
        <table>
          <tr><th>Semana</th><th>Asistencia</th><th>Series×Reps</th></tr>
          <tr><td>1-2</td><td>14 kg</td><td>5×5</td></tr>
          <tr><td>3-4</td><td>12 kg</td><td>5×5</td></tr>
          <tr><td>5-6</td><td>10 kg</td><td>5×4-5</td></tr>
          <tr><td>7-8</td><td>8 kg</td><td>5×3-5</td></tr>
          <tr><td>9-10</td><td>6 kg</td><td>Testar negativas</td></tr>
        </table>

        <h3>Reglas de progresión</h3>
        <ul>
          <li><strong>Subir reps antes de bajar asistencia.</strong> Hasta que no hagas 5×5 limpias con 14 kg, no bajas a 12 kg.</li>
          <li>Si una semana sales muy fatigada (mal sueño, periodo, estrés), no fuerces. Repite la semana anterior.</li>
          <li>Calienta con 1-2 series con más asistencia antes de las series efectivas.</li>
          <li>Las dominadas van lo primero del miércoles, sin fatiga previa.</li>
        </ul>

        <h3>Negativas — el puente final</h3>
        <p>Cuando ya estés cerca (8 kg de asistencia o menos), las negativas son el ejercicio más eficaz para el último empujón hacia la dominada libre.</p>
        <h4>Cómo se hacen</h4>
        <ul>
          <li>Subes con ayuda: salto, caja, o impulso. Llegas con el mentón arriba.</li>
          <li>Bajas controlada en <strong>5-7 segundos</strong>, manteniendo tensión todo el recorrido.</li>
          <li>3-4 series de 3-5 negativas.</li>
          <li>Empieza intercalándolas con las dominadas asistidas, no sustituyas todo de golpe.</li>
        </ul>

        <h3>Datos a registrar</h3>
        <p>Cada miércoles, anota:</p>
        <ul>
          <li>Kg de asistencia.</li>
          <li>Reps en cada serie (las 5).</li>
          <li>Sensación 1-10 (10 = muy fácil, 1 = casi fallaste).</li>
        </ul>
        <p>Eso te dice cuándo estás lista para bajar asistencia.</p>
      `
    },
    {
      id: "agilidad",
      number: "05",
      title: "Agilidad y circuito",
      summary: "Por qué solo en sábado y opcional",
      content: `
        <p class="lead">Configuración temporal de Basic Fit. El gimnasio actual no tiene espacio adecuado para trabajo de agilidad real, por eso queda fuera de los días entre semana.</p>

        <h3>Qué entrenas con la agilidad</h3>
        <p>Tres cualidades:</p>
        <ul>
          <li><strong>Velocidad de pies:</strong> coordinación neuromuscular para no enredarte.</li>
          <li><strong>Cambios de dirección:</strong> frenar, girar, reacelerar.</li>
          <li><strong>Aceleración:</strong> salir explosiva desde parado.</li>
        </ul>
        <p>Estas tres cualidades son la base de cualquier circuito que te pongan en CNP. El formato exacto del examen lo sabrás en la academia, pero la base neuromuscular es transferible.</p>

        <h3>Por qué no se hace en gimnasio</h3>
        <ul>
          <li>Basic Fit no tiene espacio libre para sprints.</li>
          <li>No te van a dejar montar conos.</li>
          <li>Hacerlo en mitad de la sala llama la atención sin necesidad.</li>
        </ul>

        <h3>Solución actual</h3>
        <ul>
          <li>Sábado en parque, al final del entreno (cuando ya estás caliente).</li>
          <li><strong>Opcional</strong>: si tienes tiempo y energía. Si no, se salta sin culpa.</li>
          <li>Compras 8-10 conos pequeños baratos (8-10€) para montarte el 5-10-5 y slaloms.</li>
        </ul>

        <h3>5-10-5 — el ejercicio principal</h3>
        <p>Si solo haces uno, este. Trabaja los tres cambios de dirección que cualquier circuito te va a pedir.</p>
        <p>Detalles completos en la guía "Sábado paso a paso".</p>

        <h3>Cuándo cambiará el plan</h3>
        <ul>
          <li><strong>Junio (Go Fit):</strong> si la sala funcional permite agilidad, añadiremos un bloque entre semana.</li>
          <li><strong>Academia:</strong> te darán circuito específico y todo el plan se adapta a eso.</li>
        </ul>
      `
    },
    {
      id: "logica-semana",
      number: "07",
      title: "Lógica de la semana",
      summary: "Por qué cada día está en su sitio",
      content: `
        <p class="lead">La semana se construye alrededor de dos días clave: el <strong>miércoles</strong> (tirón fuerte con dominadas) y el <strong>sábado</strong> (carrera y suspensión supina en parque). Todo lo demás se ordena para que llegues fresca a esos dos días, que son los que más pesan para aprobar las pruebas.</p>

        <h3>Distribución de la semana</h3>
        <ul>
          <li><strong>Lunes empuje:</strong> abre semana sin tocar tirones ni piernas.</li>
          <li><strong>Martes pierna:</strong> con 4 días de margen al sábado.</li>
          <li><strong>Miércoles tirón fuerte:</strong> fresca de empuje y pierna.</li>
          <li><strong>Jueves agarre puro:</strong> sin tirón pesado, no estorba al sábado.</li>
          <li><strong>Viernes descanso:</strong> recuperación total.</li>
          <li><strong>Sábado:</strong> espalda y agarre descansados desde miércoles.</li>
          <li><strong>Domingo tirón supino:</strong> con espalda recuperada (4 días desde miércoles).</li>
        </ul>

        <h3>Frecuencia semanal por grupo</h3>
        <table>
          <tr><th>Grupo</th><th>Frec.</th></tr>
          <tr><td>Pecho</td><td>1×</td></tr>
          <tr><td>Hombro</td><td>2×</td></tr>
          <tr><td>Tríceps</td><td>2×</td></tr>
          <tr><td>Espalda</td><td>2×</td></tr>
          <tr><td>Bíceps</td><td>1-2×</td></tr>
          <tr><td>Pierna</td><td>1×</td></tr>
          <tr><td>Core</td><td>2×</td></tr>
          <tr><td>Agarre</td><td>2×</td></tr>
        </table>

        <h3>La doble frecuencia de espalda</h3>
        <p>La espalda recibe dos estímulos perfectamente separados:</p>
        <ul>
          <li><strong>Miércoles:</strong> tirón fuerte (prono) con dominadas, remo, jalón. Acerca al fallo, busca progresión.</li>
          <li><strong>Domingo:</strong> tirón accesorio (supino) con jalón, remo máquina, face pull. Cargas medias, sin fallo, busca volumen y especificidad.</li>
        </ul>
        <p>Los 4 días entre ambos permiten recuperación completa y aprovechar dos estímulos útiles.</p>
      `
    },
    {
      id: "analisis-nivel",
      number: "08",
      title: "Análisis de tu nivel",
      summary: "Qué te falta para aprobar las pruebas",
      content: `
        <p class="lead">Análisis basado en los datos iniciales: dominadas asistidas con 14 kg de asistencia × 5 reps, jalón al pecho 12 reps con 27 kg después de dominadas.</p>

        <h3>Dominadas</h3>
        <p>Estás moviendo unos 46-51 kg en dominadas asistidas (peso corporal menos asistencia). Para una dominada libre necesitas mover tu peso completo. Te faltan aproximadamente esos 14 kg de asistencia. Es alcanzable, pero no inmediato: realistamente hablamos de varios meses de progresión bien planificada.</p>

        <h3>Jalón al pecho</h3>
        <p>27 kg en jalón es bajo en relación a tu peso. Para tener dominadas libres cómodas, lo ideal es jalonar al menos tu peso corporal por 6-8 reps limpias. Te queda recorrido en fuerza de tirón puro.</p>

        <h3>Suspensión supina</h3>
        <p>Dato pendiente. La marca mínima orientativa para mujeres en CNP suele rondar los 30-40 segundos según convocatoria. <strong>Mide tu suspensión supina máxima esta semana</strong> para ajustar el plan.</p>

        <h3>Carrera 1 km</h3>
        <p>Dato pendiente. Marcas competitivas para mujeres rondan los 4:00-4:30 min. Si no has corrido 1 km recientemente, es otro dato crítico que falta.</p>

        <h3>Qué te falta para aprobar</h3>
        <ul>
          <li>Subir fuerza de tirón hasta poder hacer dominadas libres (lo más limitante).</li>
          <li>Resistencia isométrica específica de suspensión supina.</li>
          <li>Capacidad de correr 1 km en marca, mezcla de VO2 max y umbral.</li>
          <li>Agilidad y cambios de dirección.</li>
          <li>Potencia de tren inferior para el circuito.</li>
        </ul>

        <h3>Sobre lipedema</h3>
        <p>El plan respeta tu condición:</p>
        <ul>
          <li>Volumen de pierna controlado (5 ejercicios, no 6-7).</li>
          <li>Prioriza glúteo e isquio sobre cuádriceps puro.</li>
          <li>Trabajo unilateral importante para potencia sin sobrecargar tejido.</li>
          <li>Cardio en superficie blanda los días de intervalo.</li>
        </ul>

        <h3>Próximos pasos</h3>
        <p>Cuando lleves 2-3 semanas con el plan, registra:</p>
        <ul>
          <li>Tiempo de suspensión supina máxima.</li>
          <li>Tiempo de 1 km en test.</li>
          <li>Cómo está respondiendo tu pierna al volumen.</li>
        </ul>
        <p>Con esos tres datos se ajusta la fase 2 (semanas 9-16) ya orientada a especificidad de prueba con tiempos objetivo concretos.</p>
      `
    }
  ]
};
