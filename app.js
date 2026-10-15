/* ========================================
   1. CONFIGURACIÓN DE INDEXEDDB
======================================== */

const DB_NAME = "ByteMusicDB";
const DB_VERSION = 3;
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
   PORTADAS
======================================== */

// Colores para las portadas generadas
const PALETAS = [
  ["#10cad5", "#7c5cff"],
  ["#ff6b81", "#ff9f43"],
  ["#43e97b", "#10cad5"],
  ["#7c5cff", "#e94f9f"],
  ["#f6d365", "#fda085"],
  ["#2193b0", "#6dd5ed"],
];

// Portada con degradado y nota musical (el mismo texto da siempre los mismos colores)
function generarPortada(texto = "") {
  let h = 0;
  for (const ch of texto) h = (h * 31 + ch.charCodeAt(0)) >>> 0;

  return "https://img.freepik.com/fotos-premium/chica-anime-escuchando-musica-noche-lofi-triste_911078-5774.jpg";
}

// Lee la portada incrustada en el archivo de audio (devuelve un Blob o null)
function leerPortada(archivo) {
  return new Promise((resolve) => {
    if (!window.jsmediatags) return resolve(null);

    window.jsmediatags.read(archivo, {
      onSuccess: (tag) => {
        const pic = tag.tags.picture;
        if (!pic) return resolve(null);
        resolve(
          new Blob([new Uint8Array(pic.data)], {
            type: pic.format || "image/jpeg",
          }),
        );
      },
      onError: () => resolve(null),
    });
  });
}

// Portada real si existe; si no, la generada
function portadaDe(c) {
  return c.portadaUrl || generarPortada(c.titulo + c.nombre);
}

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
  // Migrar las canciones de la versión 2 a la versión 3
  if (event.oldVersion < 3) {
    const cursorRequest = cancionesStore.openCursor();

    cursorRequest.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) return;

      const c = cursor.value;

      // Convertir el playlistId antiguo en una lista playlistIds
      if (!Array.isArray(c.playlistIds)) {
        c.playlistIds = [c.playlistId || "default"];
      }

      delete c.playlistId;

      cursor.update(c);
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
const portadaActual = document.getElementById("portada-actual");
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
const plPortada = document.getElementById("pl-portada");

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

/* ---------- Portadas iniciales (hasta que haya canción o playlist cargada) ---------- */
if (portadaActual) portadaActual.src = generarPortada("ByteMusic");
if (plPortada) plPortada.src = generarPortada("Mi playlist");

function actualizarPortadaPlaylist(nombre) {
  if (plPortada) plPortada.src = generarPortada(nombre);
}

function actualizarPortadaReproductor() {
  if (!portadaActual) return;
  const actual = cola[indiceCancionActual];
  portadaActual.src = actual ? portadaDe(actual) : generarPortada("ByteMusic");
}

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

  // Si lo activas en una playlist que no suena, empieza por una al azar
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
    playlists = req.result.sort((a, b) => {
      if (a.id === "default") return -1;
      if (b.id === "default") return 1;
      return 0;
    });

    if (playlists.length === 0) {
      crearPlaylistInicial();
      return;
    }

    const activa = playlists.find((p) => p.id === playlistActual);
    if (activa && plNombre) {
      plNombre.textContent = activa.nombre;
      actualizarPortadaPlaylist(activa.nombre);
    }

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
    actualizarPortadaPlaylist(playlistInicial.nombre);
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
    const contenedor = document.createElement("div");
    contenedor.classList.add("sidebar-playlist");

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

    contenedor.appendChild(enlace);

    // No permitir eliminar la playlist predeterminada
    if (playlist.id !== "default") {
      const botonEliminar = document.createElement("button");
      botonEliminar.type = "button";
      botonEliminar.classList.add("boton-borrar-playlist");
      botonEliminar.title = "Eliminar playlist";
      botonEliminar.setAttribute("aria-label", `Eliminar ${playlist.nombre}`);
      botonEliminar.innerHTML = '<i class="bi bi-trash3"></i>';

      botonEliminar.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        eliminarPlaylist(playlist.id);
      });

      contenedor.appendChild(botonEliminar);
    }

    listaPlaylists.appendChild(contenedor);
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
  actualizarPortadaPlaylist(seleccionada.nombre);

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
    const urlsEnCola = new Set(cola.flatMap((c) => [c.fuente, c.portadaUrl]));
    canciones.forEach((c) => {
      if (!urlsEnCola.has(c.fuente)) URL.revokeObjectURL(c.fuente);
      if (c.portadaUrl && !urlsEnCola.has(c.portadaUrl)) {
        URL.revokeObjectURL(c.portadaUrl);
      }
    });

    canciones = req.result
      .filter((c) =>
        Array.isArray(c.playlistIds)
          ? c.playlistIds.includes(playlistActual)
          : (c.playlistId || "default") === playlistActual,
      )
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      .map((c) => ({
        ...c,
        fuente: URL.createObjectURL(c.archivo),
        portadaUrl: c.portada ? URL.createObjectURL(c.portada) : null,
      }));

    actualizarPlaylist();
    inicializarSortable();
    completarPortadas();
  };
}

// Busca la portada de las canciones guardadas que todavía no se han comprobado
function completarPortadas() {
  canciones.forEach((c) => {
    if (c.portada !== undefined) return; // ya comprobada

    leerPortada(c.archivo).then((portada) => {
      console.log(`${c.titulo}: ${portada ? "con portada" : "sin portada"}`);

      c.portada = portada;
      if (portada) c.portadaUrl = URL.createObjectURL(portada);

      // Guardar el resultado para no volver a comprobarlo
      if (db) {
        const store = db
          .transaction(STORE_NAME, "readwrite")
          .objectStore(STORE_NAME);
        const get = store.get(c.id);
        get.onsuccess = () => {
          if (get.result) {
            get.result.portada = portada;
            store.put(get.result);
          }
        };
      }

      if (canciones.includes(c) || cola.includes(c)) {
        actualizarPlaylist();
        actualizarPortadaReproductor();
      }
    });
  });
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
  const ordenBase = canciones.length;

  archivos.forEach((archivo, i) => {
    leerPortada(archivo).then((portada) => {
      console.log(
        `${archivo.name}: ${portada ? "con portada" : "sin portada"}`,
      );

      const nombreArchivo = archivo.name.replace(/\.[^/.]+$/, "");
      const partes = nombreArchivo.split("-");

      const datosCancion = {
        titulo: partes.slice(1).join("-").trim() || "Título desconocido",
        nombre: partes[0].trim() || "Artista desconocido",
        archivo,
        portada, // Blob o null
        playlistIds: [playlistActual],
        orden: ordenBase + i,
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
          portadaUrl: portada ? URL.createObjectURL(portada) : null,
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
  });

  if (archivos.length > 0) sacarTargeta();

  e.target.value = "";
});
/* Eliminar playlist */

function eliminarPlaylist(id) {
  if (!db || id === "default") return;

  const playlist = playlists.find((p) => p.id === id);
  if (!playlist) return;

  const confirmar = confirm(
    `¿Quieres eliminar la playlist "${playlist.nombre}" y quitar de ella todas sus canciones?\n\nLas canciones que pertenezcan a otras playlists se conservarán.`,
  );

  if (!confirmar) return;

  const transaction = db.transaction(
    [PLAYLIST_STORE_NAME, STORE_NAME],
    "readwrite",
  );

  const playlistsStore = transaction.objectStore(PLAYLIST_STORE_NAME);
  const cancionesStore = transaction.objectStore(STORE_NAME);

  const requestCanciones = cancionesStore.getAll();

  requestCanciones.onsuccess = () => {
    requestCanciones.result.forEach((c) => {
      const ids = Array.isArray(c.playlistIds)
        ? c.playlistIds
        : [c.playlistId || "default"];

      if (!ids.includes(id)) return;

      const nuevosIds = ids.filter((playlistId) => playlistId !== id);

      // Si no pertenece a ninguna otra playlist, borrar la canción.
      if (nuevosIds.length === 0) {
        cancionesStore.delete(c.id);
      } else {
        c.playlistIds = nuevosIds;
        delete c.playlistId;
        cancionesStore.put(c);
      }
    });

    playlistsStore.delete(id);
  };

  transaction.oncomplete = () => {
    const estabaSeleccionada = playlistActual === id;
    const estabaSonando = playlistReproduciendo === id;

    playlists = playlists.filter((p) => p.id !== id);

    if (estabaSeleccionada) {
      playlistActual = "default";
    }

    if (estabaSonando) {
      pausarCancion();
      cola = [];
      playlistReproduciendo = null;
      indiceCancionActual = 0;
      cancion.removeAttribute("src");
      cancion.load();
      tituloCancion.textContent = "Título";
      nombreArtista.textContent = "Artista";
      actualizarPortadaReproductor();
    }

    mostrarPlaylists();

    if (estabaSeleccionada || estabaSonando) {
      seleccionarPlaylist(playlistActual);
    } else {
      cargarCanciones();
    }
  };

  transaction.onerror = () => {
    console.error("No se pudo eliminar la playlist:", transaction.error);
  };
}

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
    img.src = portadaDe(c);
    img.title = c.portadaUrl
      ? "Portada del archivo"
      : "Este archivo no trae portada";
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
          actualizarPortadaReproductor();
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
  actualizarPortadaReproductor();
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

      // Guardar el nuevo orden (sin las URLs temporales)
      if (db) {
        const store = db
          .transaction(STORE_NAME, "readwrite")
          .objectStore(STORE_NAME);

        canciones.forEach((item, index) => {
          item.orden = index;
          const { fuente, portadaUrl, ...datos } = item;
          store.put(datos);
        });
      }

      actualizarPlaylist();
    },
  });
}
