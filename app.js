/* ========================================
   1. CONFIGURACIÓN DE INDEXEDDB
======================================== */

const DB_NAME = "ByteMusicDB";
const DB_VERSION = 2;
const STORE_NAME = "canciones";
const PLAYLIST_STORE_NAME = "playlists";

/* ========================================
   ESTADO DE LA APLICACIÓN
======================================== */

let db;
let playlists = [];

// Playlist que estás VIENDO en pantalla y sus canciones
let playlistActual = "default";
let canciones = [];

// Playlist que está SONANDO y sus canciones (cola de reproducción)
let cola = [];
let playlistReproduciendo = null;
let indiceCancionActual = 0; // posición dentro de la cola

// Modos del reproductor
let modoAleatorio = false;
let modoRepetir = false;

/* ========================================
   ABRIR LA BASE DE DATOS
======================================== */

const request = indexedDB.open(DB_NAME, DB_VERSION);

request.onupgradeneeded = (event) => {
  const dbUpgrade = event.target.result;
  const transaction = event.target.transaction;
  let cancionesStore;

  if (!dbUpgrade.objectStoreNames.contains(STORE_NAME)) {
    cancionesStore = dbUpgrade.createObjectStore(STORE_NAME, {
      keyPath: "id",
      autoIncrement: true,
    });
  } else {
    cancionesStore = transaction.objectStore(STORE_NAME);
  }

  if (!dbUpgrade.objectStoreNames.contains(PLAYLIST_STORE_NAME)) {
    const playlistsStore = dbUpgrade.createObjectStore(PLAYLIST_STORE_NAME, {
      keyPath: "id",
    });
    playlistsStore.add({ id: "default", nombre: "Mi playlist" });
  }

  // Migrar canciones antiguas a la playlist predeterminada
  if (event.oldVersion < 2) {
    const cursorRequest = cancionesStore.openCursor();
    cursorRequest.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) return;
      const c = cursor.value;
      if (!c.playlistId) {
        c.playlistId = "default";
        cursor.update(c);
      }
      cursor.continue();
    };
  }
};

request.onsuccess = (event) => {
  db = event.target.result;
  db.onversionchange = () => {
    db.close();
    console.warn("La base de datos se ha cerrado por un cambio de versión.");
  };
  cargarPlaylists();
};

request.onerror = () => {
  console.error("Error al abrir IndexedDB:", request.error);
};

request.onblocked = () => {
  console.warn(
    "La apertura de IndexedDB está bloqueada. Cierra otras pestañas de ByteMusic.",
  );
};

/* ========================================
   2. ELEMENTOS DEL DOM
======================================== */

/* ---------- Reproductor ---------- */
const tituloCancion = document.querySelector("#reproductor-musica h6");
const nombreArtista = document.getElementById("nombre");
const cancion = document.getElementById("cancion");
const progreso = document.getElementById("progreso");
const controlVolumen = document.getElementById("control-volumen");
const iconoControl = document.querySelector(".iconoControl");
const botonReproducirPausar = document.querySelector(
  ".boton-reproducir-pausar",
);
const botonAtras = document.querySelector(".atras");
const botonAdelante = document.querySelector(".adelante");
const botonAleatorio = document.querySelector(".aleatorio");
const botonRepetir = document.querySelector(".repetir");
const divMinutos = document.getElementById("minutos");

/* ---------- Lista de canciones ---------- */
const playListContainer = document.getElementById("playlist-container");

/* ---------- Cabecera de la playlist ---------- */
const plNombre = document.getElementById("pl-nombre");
const plTotal = document.getElementById("pl-total");

/* ---------- Playlists ---------- */
const botonCrearPlaylist = document.getElementById("crear-playlist");
const listaPlaylists = document.getElementById("lista-playlists");

/* ---------- Modal de creación de playlist ---------- */
const modalCrearPlaylist = document.getElementById("modalCrearPlaylist");
const formularioPlaylist = document.getElementById("formCrearPlaylist");
const inputNombrePlaylist = document.getElementById("nombrePlaylist");
const errorNombrePlaylist = document.getElementById("errorNombrePlaylist");

/* ---------- Mensaje de éxito ---------- */
const tarjeta = document.getElementById("tarjetaExito");

/* =========================================================
   3. COLA DE REPRODUCCIÓN
   ========================================================= */

// Empieza a sonar la playlist que estás viendo, desde la canción indicada
function reproducirDesde(indice) {
  if (canciones.length === 0) return;
  cola = [...canciones];
  playlistReproduciendo = playlistActual;
  indiceCancionActual = indice;
  actualizarInfoCancion();
  reproducirCancion();
}

/* ---------- Botones de la cabecera ---------- */

document.getElementById("pl-reproducir")?.addEventListener("click", () => {
  if (playlistReproduciendo === playlistActual && cola.length > 0) {
    reproducirPausar(); // misma playlist: play / pausa
  } else {
    reproducirDesde(0); // otra playlist: empieza por la primera
  }
});

const botonHeaderAleatorio = document.getElementById("pl-aleatorio");

botonHeaderAleatorio?.addEventListener("click", () => {
  botonAleatorio.click(); // activa o desactiva el modo aleatorio

  // Si activas el aleatorio en una playlist que no suena, empieza por una al azar
  if (
    modoAleatorio &&
    playlistReproduciendo !== playlistActual &&
    canciones.length > 0
  ) {
    reproducirDesde(Math.floor(Math.random() * canciones.length));
  }
});

// Mantiene el botón del header encendido o apagado según el modo
new MutationObserver(() => {
  botonHeaderAleatorio?.classList.toggle("active", modoAleatorio);
}).observe(botonAleatorio, { attributes: true, attributeFilter: ["class"] });

/* =========================================================
   4. GESTIÓN DE PLAYLISTS
   ========================================================= */

function cargarPlaylists() {
  if (!db) return;

  const store = db
    .transaction(PLAYLIST_STORE_NAME, "readonly")
    .objectStore(PLAYLIST_STORE_NAME);
  const req = store.getAll();

  req.onsuccess = () => {
    playlists = req.result;

    if (playlists.length === 0) {
      crearPlaylistInicial();
      return;
    }

    const activa = playlists.find((p) => p.id === playlistActual);
    if (activa && plNombre) plNombre.textContent = activa.nombre;

    mostrarPlaylists();
    cargarCanciones();
  };

  req.onerror = () => {
    console.error("Error al cargar las playlists:", req.error);
  };
}

function crearPlaylistInicial() {
  if (!db) return;

  const playlistInicial = { id: "default", nombre: "Mi playlist" };
  const store = db
    .transaction(PLAYLIST_STORE_NAME, "readwrite")
    .objectStore(PLAYLIST_STORE_NAME);
  const req = store.add(playlistInicial);

  req.onsuccess = () => {
    playlists = [playlistInicial];
    playlistActual = "default";
    if (plNombre) plNombre.textContent = playlistInicial.nombre;
    mostrarPlaylists();
    cargarCanciones();
  };

  req.onerror = () => {
    console.error("Error al crear la playlist inicial:", req.error);
  };
}

function mostrarPlaylists() {
  if (!listaPlaylists) return;

  listaPlaylists.innerHTML = "";

  playlists.forEach((playlist) => {
    const enlace = document.createElement("a");
    enlace.href = "#";
    enlace.classList.add("sidebar-item");
    enlace.title = playlist.nombre;

    const icono = document.createElement("i");
    icono.className = "bi bi-music-note-list";

    const nombre = document.createElement("span");
    nombre.textContent = playlist.nombre;

    enlace.append(icono, nombre);

    enlace.addEventListener("click", (event) => {
      event.preventDefault();
      seleccionarPlaylist(playlist.id);
    });

    if (playlist.id === playlistActual) {
      enlace.classList.add("active");
    }

    listaPlaylists.appendChild(enlace);
  });
}

function seleccionarPlaylist(id) {
  const seleccionada = playlists.find((p) => p.id === id);
  if (!seleccionada) {
    console.error("No se ha encontrado la playlist:", id);
    return;
  }

  playlistActual = id;
  if (plNombre) plNombre.textContent = seleccionada.nombre;

  mostrarPlaylists();
  cargarCanciones();
}

/* ---------- Abrir el modal ---------- */

botonCrearPlaylist.addEventListener("click", () => {
  errorNombrePlaylist.textContent = "";
  inputNombrePlaylist.classList.remove("is-invalid");

  const modal = bootstrap.Modal.getOrCreateInstance(modalCrearPlaylist);
  modal.show();

  modalCrearPlaylist.addEventListener(
    "shown.bs.modal",
    () => inputNombrePlaylist.focus(),
    { once: true },
  );
});

/* ---------- Crear la playlist ---------- */

formularioPlaylist.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!db) {
    errorNombrePlaylist.textContent =
      "La base de datos todavía no está preparada.";
    return;
  }

  const nombre = inputNombrePlaylist.value.trim();

  if (nombre === "") {
    errorNombrePlaylist.textContent = "Escribe un nombre para la playlist.";
    inputNombrePlaylist.classList.add("is-invalid");
    inputNombrePlaylist.focus();
    return;
  }

  const nombreExiste = playlists.some(
    (p) => p.nombre.toLowerCase() === nombre.toLowerCase(),
  );

  if (nombreExiste) {
    errorNombrePlaylist.textContent = "Ya existe una playlist con ese nombre.";
    inputNombrePlaylist.classList.add("is-invalid");
    inputNombrePlaylist.focus();
    return;
  }

  const nuevaPlaylist = { id: crypto.randomUUID(), nombre };

  const store = db
    .transaction(PLAYLIST_STORE_NAME, "readwrite")
    .objectStore(PLAYLIST_STORE_NAME);
  const addRequest = store.add(nuevaPlaylist);

  addRequest.onsuccess = () => {
    playlists.push(nuevaPlaylist);
    seleccionarPlaylist(nuevaPlaylist.id);
    bootstrap.Modal.getOrCreateInstance(modalCrearPlaylist).hide();
  };

  addRequest.onerror = () => {
    errorNombrePlaylist.textContent =
      "No se ha podido crear la playlist. Inténtalo de nuevo.";
    console.error("Error al crear la playlist:", addRequest.error);
  };
});

// Quitar el error al escribir
inputNombrePlaylist.addEventListener("input", () => {
  inputNombrePlaylist.classList.remove("is-invalid");
  errorNombrePlaylist.textContent = "";
});

// Limpiar el formulario al cerrar el modal
modalCrearPlaylist.addEventListener("hidden.bs.modal", () => {
  formularioPlaylist.reset();
  errorNombrePlaylist.textContent = "";
  inputNombrePlaylist.classList.remove("is-invalid");
});

/* =========================================================
   5. CANCIONES
   ========================================================= */

function cargarCanciones() {
  if (!db) return;

  const req = db
    .transaction(STORE_NAME, "readonly")
    .objectStore(STORE_NAME)
    .getAll();

  req.onsuccess = () => {
    // Liberar las URLs antiguas que no se estén usando en la cola
    const enCola = new Set(cola.map((c) => c.fuente));
    canciones.forEach((c) => {
      if (!enCola.has(c.fuente)) URL.revokeObjectURL(c.fuente);
    });

    canciones = req.result
      .filter((c) => (c.playlistId || "default") === playlistActual)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      .map((c) => ({ ...c, fuente: URL.createObjectURL(c.archivo) }));

    actualizarPlaylist();
    inicializarSortable();
  };
}

function comprobarAnchura() {
  const contenedor = document.querySelector(".titulo-container");
  if (!contenedor) return;

  if (tituloCancion.scrollWidth > contenedor.clientWidth) {
    tituloCancion.classList.add("scroll");
  } else {
    tituloCancion.classList.remove("scroll");
  }
}

/* =========================================================
   6. TARJETA DE ÉXITO
   ========================================================= */

function sacarTargeta() {
  tarjeta.style.display = "block";
}

function cerrarTarjeta() {
  tarjeta.style.display = "none";
}

/* =========================================================
   7. AÑADIR CANCIONES
   ========================================================= */

document.getElementById("musica-input").addEventListener("change", (e) => {
  if (!db) return;

  const archivos = Array.from(e.target.files);

  archivos.forEach((archivo, i) => {
    const nombreArchivo = archivo.name.replace(/\.[^/.]+$/, "");
    const partes = nombreArchivo.split("-");

    const datosCancion = {
      titulo: partes.slice(1).join("-").trim() || "Título desconocido",
      nombre: partes[0].trim() || "Artista desconocido",
      archivo,
      imagenUrl:
        "https://img.freepik.com/fotos-premium/chica-anime-escuchando-musica-noche-lofi-triste_911078-5774.jpg",
      playlistId: playlistActual,
      orden: canciones.length + i,
    };

    const store = db
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME);
    const addRequest = store.add(datosCancion);

    addRequest.onsuccess = () => {
      const nueva = {
        ...datosCancion,
        id: addRequest.result,
        fuente: URL.createObjectURL(archivo),
      };

      canciones.push(nueva);

      // Si esta playlist es la que suena, la canción entra también en la cola
      if (playlistReproduciendo === playlistActual) {
        cola.push(nueva);
      }

      // Si no había nada preparado en el reproductor, carga la primera
      if (cola.length === 0) {
        cola = [...canciones];
        playlistReproduciendo = playlistActual;
        indiceCancionActual = 0;
        actualizarInfoCancion();
      } else {
        actualizarPlaylist();
      }
    };

    addRequest.onerror = () => {
      console.error(`No se pudo importar ${archivo.name}:`, addRequest.error);
    };
  });

  if (archivos.length > 0) sacarTargeta();

  e.target.value = "";
});

/* =========================================================
   8. MOSTRAR LA LISTA DE CANCIONES
   ========================================================= */

function actualizarPlaylist() {
  // Contador de la cabecera
  if (plTotal) {
    const n = canciones.length;
    plTotal.textContent = n + (n === 1 ? " canción" : " canciones");
  }

  playListContainer.innerHTML = "";

  if (canciones.length === 0) {
    const li = document.createElement("li");
    li.id = "playlist-vacia";
    li.textContent = "Todavía no has añadido ninguna canción";
    playListContainer.appendChild(li);
    return;
  }

  const sonandoEstaPlaylist = playlistActual === playlistReproduciendo;

  canciones.forEach((c, index) => {
    const li = document.createElement("li");
    li.dataset.index = index;

    const img = document.createElement("img");
    img.src = c.imagenUrl;
    img.style.cssText = "border-radius: 15px; margin-right: 5px;";
    img.classList.add("active");

    const span = document.createElement("span");
    span.textContent = `${c.titulo} - ${c.nombre}`;

    const botonBorrar = document.createElement("button");
    botonBorrar.innerHTML = '<i class="bi bi-trash3"></i>';
    botonBorrar.classList.add("boton-borrar");
    botonBorrar.addEventListener("click", (event) => {
      event.stopPropagation();
      borrarCancion(c.id);
    });

    const botonMover = document.createElement("button");
    botonMover.innerHTML = '<i class="bi bi-grip-vertical"></i>';
    botonMover.classList.add("boton-mover");

    // Al pulsar una canción, suena esa playlist desde esa canción
    li.onclick = () => reproducirDesde(index);

    // Solo se marca la canción de la playlist que está sonando
    if (sonandoEstaPlaylist && index === indiceCancionActual) {
      const loader = document.createElement("div");
      loader.classList.add("loader");
      if (cancion.paused) loader.style.animationPlayState = "paused";
      span.appendChild(loader);
      li.classList.add("active");
    }

    li.append(img, span, botonBorrar, botonMover);
    playListContainer.appendChild(li);
  });
}

/* =========================================================
   9. BORRAR CANCIÓN
   ========================================================= */

function borrarCancion(id) {
  if (!db) return;

  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).delete(id);

  transaction.oncomplete = () => {
    const sonandoEstaPlaylist = playlistReproduciendo === playlistActual;
    const idActual = cola[indiceCancionActual]?.id;

    canciones = canciones.filter((c) => c.id !== id);

    if (sonandoEstaPlaylist) {
      cola = cola.filter((c) => c.id !== id);

      if (idActual === id) {
        // Se ha borrado la canción que sonaba
        pausarCancion();

        if (cola.length > 0) {
          indiceCancionActual = Math.min(indiceCancionActual, cola.length - 1);
          actualizarInfoCancion();
        } else {
          playlistReproduciendo = null;
          indiceCancionActual = 0;
          cancion.removeAttribute("src");
          cancion.load();
          tituloCancion.textContent = "Titulo";
          nombreArtista.textContent = "Nombre";
        }
      } else {
        // Se ha borrado otra: recolocar el índice de la que sigue sonando
        indiceCancionActual = Math.max(
          0,
          cola.findIndex((c) => c.id === idActual),
        );
      }
    }

    actualizarPlaylist();
  };
}

/* =========================================================
   10. INFORMACIÓN DE LA CANCIÓN
   ========================================================= */

function actualizarInfoCancion() {
  const actual = cola[indiceCancionActual];
  if (!actual) return;

  tituloCancion.textContent = actual.titulo;
  nombreArtista.textContent = actual.nombre;
  cancion.src = actual.fuente;
  cancion.loop = modoRepetir;

  actualizarPlaylist();
  comprobarAnchura();
}

/* =========================================================
   11. VOLUMEN
   ========================================================= */

controlVolumen.addEventListener("input", function () {
  cancion.volume = controlVolumen.value;
  const valor = ((this.value - this.min) / (this.max - this.min)) * 100;
  this.style.background = `linear-gradient(to right, #FFFAFA ${valor}%, #272727 ${valor}%)`;
});

cancion.addEventListener("volumechange", function () {
  controlVolumen.value = cancion.volume;
});

/* =========================================================
   12. PROGRESO
   ========================================================= */

cancion.addEventListener("loadedmetadata", function () {
  progreso.max = cancion.duration;
  progreso.value = cancion.currentTime;
  actualizarMinutosRestantes();
});

cancion.addEventListener("timeupdate", function () {
  if (!cancion.paused) {
    progreso.value = cancion.currentTime;
    const porcentaje =
      ((progreso.value - progreso.min) / (progreso.max - progreso.min)) * 100;
    progreso.style.background = `linear-gradient(to right, #10CAD5 ${porcentaje}%, #ddd ${porcentaje}%)`;
    actualizarMinutosRestantes();
  }
});

progreso.addEventListener("input", function () {
  cancion.currentTime = progreso.value;
  const porcentaje =
    ((progreso.value - progreso.min) / (progreso.max - progreso.min)) * 100;
  progreso.style.background = `linear-gradient(to right, #10CAD5 ${porcentaje}%, #ddd ${porcentaje}%)`;
});

/* =========================================================
   13. PLAY / PAUSA
   ========================================================= */

botonReproducirPausar.addEventListener("click", reproducirPausar);

function reproducirPausar() {
  // Si todavía no ha sonado nada, empieza la playlist que estás viendo
  if (cola.length === 0) {
    reproducirDesde(0);
    return;
  }

  if (cancion.paused) {
    reproducirCancion();
  } else {
    pausarCancion();
  }
}

function reproducirCancion() {
  if (cola.length === 0) return;

  cancion.play().catch(() => {});

  const loader = document.querySelector(".loader");
  if (loader) loader.style.animationPlayState = "running";

  iconoControl.classList.add("bi-pause-circle-fill");
  iconoControl.classList.remove("bi-play-circle-fill");
}

function pausarCancion() {
  cancion.pause();

  const loader = document.querySelector(".loader");
  if (loader) loader.style.animationPlayState = "paused";

  iconoControl.classList.remove("bi-pause-circle-fill");
  iconoControl.classList.add("bi-play-circle-fill");
}

/* =========================================================
   14. SIGUIENTE, ANTERIOR Y FIN DE CANCIÓN
   ========================================================= */

function pasarASiguiente() {
  if (cola.length === 0) return;

  if (modoRepetir) {
    cancion.currentTime = 0;
    reproducirCancion();
    return;
  }

  indiceCancionActual = modoAleatorio
    ? obtenerIndiceAleatorio()
    : (indiceCancionActual + 1) % cola.length;

  actualizarInfoCancion();
  reproducirCancion();
}

botonAdelante.addEventListener("click", pasarASiguiente);
cancion.addEventListener("ended", pasarASiguiente);

botonAtras.addEventListener("click", function () {
  if (cola.length === 0) return;

  indiceCancionActual = modoAleatorio
    ? obtenerIndiceAleatorio()
    : (indiceCancionActual - 1 + cola.length) % cola.length;

  actualizarInfoCancion();
  reproducirCancion();
});

function obtenerIndiceAleatorio() {
  if (cola.length === 0) return 0;

  let nuevo;
  do {
    nuevo = Math.floor(Math.random() * cola.length);
  } while (nuevo === indiceCancionActual && cola.length > 1);

  return nuevo;
}

/* =========================================================
   15. ALEATORIO Y REPETIR
   ========================================================= */

botonAleatorio.addEventListener("click", function () {
  modoAleatorio = !modoAleatorio;
  botonAleatorio.classList.toggle("active");
});

botonRepetir.addEventListener("click", function () {
  modoRepetir = !modoRepetir;
  botonRepetir.classList.toggle("active");
  cancion.loop = modoRepetir;
});

/* =========================================================
   16. MINUTOS RESTANTES
   ========================================================= */

function actualizarMinutosRestantes() {
  if (!Number.isFinite(cancion.duration)) return;

  const tiempoRestante = cancion.duration - cancion.currentTime;
  const minutos = Math.floor(tiempoRestante / 60);
  const segundos = Math.floor(tiempoRestante % 60)
    .toString()
    .padStart(2, "0");

  divMinutos.textContent = `${minutos} : ${segundos}`;
}

/* =========================================================
   17. ARRASTRAR PARA REORDENAR (SORTABLE)
   ========================================================= */

function inicializarSortable() {
  // Evitar crear varios Sortable sobre el mismo elemento
  if (playListContainer._sortable) {
    playListContainer._sortable.destroy();
  }

  playListContainer._sortable = new Sortable(playListContainer, {
    animation: 150,
    handle: ".boton-mover",

    onEnd: function (event) {
      if (event.oldIndex === undefined || event.newIndex === undefined) return;

      const idActual = cola[indiceCancionActual]?.id;

      // Reordenar la lista visible
      const movida = canciones.splice(event.oldIndex, 1)[0];
      canciones.splice(event.newIndex, 0, movida);

      // Si esta playlist es la que suena, mantener la cola en el mismo orden
      if (playlistReproduciendo === playlistActual) {
        cola = [...canciones];
        indiceCancionActual = Math.max(
          0,
          cola.findIndex((c) => c.id === idActual),
        );
      }

      // Guardar el nuevo orden (sin la URL temporal)
      if (db) {
        const store = db
          .transaction(STORE_NAME, "readwrite")
          .objectStore(STORE_NAME);

        canciones.forEach((item, index) => {
          item.orden = index;
          const { fuente, ...datos } = item;
          store.put(datos);
        });
      }

      actualizarPlaylist();
    },
  });
}
