const DB_NAME = "ByteMusicDB";
const DB_VERSION = 2;
const STORE_NAME = "canciones";
const PLAYLIST_STORE_NAME = "playlists";

let db;
let canciones = [];
let playlists = [];
let playlistActual = "default";

const request = indexedDB.open(DB_NAME, DB_VERSION);
console.log("REQUEST:", request);
console.log("READY STATE:", request.readyState);

setTimeout(() => {
  console.log("Después de 1 segundo:");
  console.log("DB:", db);
  console.log("REQUEST READY STATE:", request.readyState);
  console.log("REQUEST ERROR:", request.error);
}, 1000);

console.log("Intentando abrir IndexedDB:", DB_NAME, "versión:", DB_VERSION);

request.onupgradeneeded = (event) => {
  console.log("🔥 ONUPGRADENEEDED ejecutado");
  const dbUpgrade = event.target.result;
  const transaction = event.target.transaction;
  let cancionesStore;
  if (!dbUpgrade.objectStoreNames.contains(STORE_NAME)) {
    console.log("Creando store canciones...");
    cancionesStore = dbUpgrade.createObjectStore(STORE_NAME, {
      keyPath: "id",
      autoIncrement: true,
    });
  } else {
    cancionesStore = transaction.objectStore(STORE_NAME);
  }

  if (!dbUpgrade.objectStoreNames.contains(PLAYLIST_STORE_NAME)) {
    console.log("Creando store playlists...");
    const playlistsStore = dbUpgrade.createObjectStore(PLAYLIST_STORE_NAME, {
      keyPath: "id",
    });
    playlistsStore.add({
      id: "default",
      nombre: "Mi playlist",
    });
  }

  if (event.oldVersion < 2) {
    console.log("Migrando canciones a Mi playlist...");
    const cursorRequest = cancionesStore.openCursor();
    cursorRequest.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) {
        return;
      }
      const cancion = cursor.value;
      if (!cancion.playlistId) {
        cancion.playlistId = "default";
        cursor.update(cancion);
      }
      cursor.continue();
    };
  }
};

request.onsuccess = (event) => {
  console.log("🔥 ONSUCCESS EJECUTADO");
  db = event.target.result;
  console.log("IndexedDB cargada correctamente");
  console.log("Versión real:", db.version);
  console.log("Stores:", Array.from(db.objectStoreNames));
  cargarPlaylists();
};

request.onerror = () => {
  console.error("❌ ERROR REAL DE INDEXEDDB");
  console.error("Error:", request.error);
  console.error("Nombre:", request.error?.name);
  console.error("Mensaje:", request.error?.message);
};

request.onblocked = () => {
  console.error("❌ INDEXEDDB BLOQUEADA");
};

/* =========================================================
   ELEMENTOS DEL DOM
   ========================================================= */

const tituloCancion = document.querySelector("#reproductor-musica h6");
const nombreArtista = document.querySelector("#nombre");
const progreso = document.getElementById("progreso");
const cancion = document.getElementById("cancion");
const controlVolumen = document.getElementById("control-volumen");
const iconoControl = document.querySelector(".iconoControl");
const botonReproducirPausar = document.querySelector(
  ".boton-reproducir-pausar",
);
const tarjeta = document.getElementById("tarjetaExito");
const botonAtras = document.querySelector(".atras");
const botonAdelante = document.querySelector(".adelante");
const playListContainer = document.getElementById("playlist-container");
const botonAleatorio = document.querySelector(".aleatorio");
const botonRepetir = document.querySelector(".repetir");
const divMinutos = document.getElementById("minutos");

const botonCrearPlaylist = document.getElementById("crear-playlist");
const listaPlaylists = document.getElementById("lista-playlists");

/* =========================================================
   PLAYLISTS
   ========================================================= */

function cargarPlaylists() {
  if (!db) {
    console.error("La base de datos todavía no está preparada.");
    return;
  }
  const transaction = db.transaction(PLAYLIST_STORE_NAME, "readonly");
  const store = transaction.objectStore(PLAYLIST_STORE_NAME);
  const requestPlaylists = store.getAll();
  requestPlaylists.onsuccess = () => {
    playlists = requestPlaylists.result;

    /*
     * Por seguridad, si la base de datos no tiene
     * ninguna playlist, creamos Mi playlist.
     */
    if (playlists.length === 0) {
      crearPlaylistInicial();
      return;
    }
    mostrarPlaylists();
    cargarCanciones();
  };
  requestPlaylists.onerror = () => {
    console.error("Error al cargar las playlists:", requestPlaylists.error);
  };
}

function crearPlaylistInicial() {
  const playlistInicial = {
    id: "default",
    nombre: "Mi playlist",
  };
  const transaction = db.transaction(PLAYLIST_STORE_NAME, "readwrite");
  const store = transaction.objectStore(PLAYLIST_STORE_NAME);
  const addRequest = store.add(playlistInicial);
  addRequest.onsuccess = () => {
    playlists = [playlistInicial];
    playlistActual = "default";
    mostrarPlaylists();
    cargarCanciones();
  };

  addRequest.onerror = () => {
    /*
     * Si ya existe, simplemente continuamos.
     */
    playlists = [playlistInicial];
    playlistActual = "default";
    mostrarPlaylists();
    cargarCanciones();
  };
}

/* Mostrar las playlists en la barra lateral */
function mostrarPlaylists() {
  listaPlaylists.innerHTML = "";
  playlists.forEach((playlist) => {
    const elemento = document.createElement("a");
    elemento.href = "#";
    elemento.classList.add("sidebar-item");
    elemento.title = playlist.nombre;
    elemento.innerHTML = `
      <i class="bi bi-music-note-list"></i>
      <span>${playlist.nombre}</span>
    `;
    elemento.addEventListener("click", (event) => {
      event.preventDefault();
      seleccionarPlaylist(playlist.id);
    });
    listaPlaylists.appendChild(elemento);
  });
}

/* Seleccionar una playlist */
function seleccionarPlaylist(id) {
  const playlist = playlists.find((playlistItem) => playlistItem.id === id);
  if (!playlist) {
    return;
  }
  playlistActual = id;
  console.log("Playlist seleccionada:", playlist.nombre);
  document.querySelector(".playlist-header h2").textContent = playlist.nombre;
  cargarCanciones();
}

/* Crear una nueva playlist */
botonCrearPlaylist.addEventListener("click", () => {
  if (!db) {
    console.error("La base de datos todavía no está preparada.");
    return;
  }
  const nombre = prompt("Nombre de la nueva playlist:");
  if (!nombre || nombre.trim() === "") {
    return;
  }

  const nuevaPlaylist = {
    id: crypto.randomUUID(),
    nombre: nombre.trim(),
  };
  const transaction = db.transaction(PLAYLIST_STORE_NAME, "readwrite");
  const store = transaction.objectStore(PLAYLIST_STORE_NAME);
  const addRequest = store.add(nuevaPlaylist);
  addRequest.onsuccess = () => {
    playlists.push(nuevaPlaylist);
    mostrarPlaylists();
    seleccionarPlaylist(nuevaPlaylist.id);
    console.log("Playlist creada:", nuevaPlaylist.nombre);
  };

  addRequest.onerror = () => {
    console.error("Error al crear la playlist:", addRequest.error);
  };
});

/* =========================================================
   CANCIONES
   ========================================================= */

function cargarCanciones() {
  if (!db) {
    console.error("La base de datos todavía no está preparada.");
    return;
  }

  const transaction = db.transaction(STORE_NAME, "readonly");
  const store = transaction.objectStore(STORE_NAME);
  const requestCanciones = store.getAll();
  requestCanciones.onsuccess = () => {
    /*
     * Solo cogemos las canciones de la playlist actual.
     */
    canciones = requestCanciones.result
      .filter(
        (cancionItem) =>
          (cancionItem.playlistId || "default") === playlistActual,
      )
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      .map((cancionItem) => ({
        ...cancionItem,
        fuente: URL.createObjectURL(cancionItem.archivo),
      }));
    actualizarPlaylist();
    inicializarSortable();
    /*
     * Si hay canciones, cargamos la primera.
     */
    if (canciones.length > 0) {
      if (indiceCancionActual >= canciones.length) {
        indiceCancionActual = 0;
      }
    }
  };

  requestCanciones.onerror = () => {
    console.error("Error al cargar canciones:", requestCanciones.error);
  };
}

/* =========================================================
   SARA
   ========================================================= */

function Sara() {
  const contenedor = document.querySelector(".titulo-container");
  if (tituloCancion.scrollWidth > contenedor.clientWidth) {
    tituloCancion.classList.add("scroll");
    console.log("hshshshs" + tituloCancion.classList);
  } else {
    tituloCancion.classList.remove("scroll");
  }
}

/* =========================================================
   TARJETAS
   ========================================================= */

function sacarTargeta() {
  tarjeta.style.display = "block";
}

function cerrarTarjeta() {
  tarjeta.style.display = "none";
}

/* =========================================================
   AÑADIR CANCIONES
   ========================================================= */

document
  .getElementById("musica-input")
  .addEventListener("change", function (e) {
    if (!db) {
      console.error("La base de datos todavía no está preparada.");
      return;
    }

    const files = Array.from(e.target.files);
    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      const nombreCancion = file.name.replace(/\.[^/.]+$/, "");
      const separacionArchivo = nombreCancion.split("-");
      const parteAntesDelGuion = separacionArchivo[0];
      const parteDespuesDelGuion = separacionArchivo.slice(1).join("-");
      const datosCancion = {
        titulo: parteDespuesDelGuion || "Titulo Desconocido",
        nombre: parteAntesDelGuion || "Artista desconocido",
        archivo: file,
        imagenUrl:
          "https://img.freepik.com/fotos-premium/chica-anime-escuchando-musica-noche-lofi-triste_911078-5774.jpg",
        /*
         * MUY IMPORTANTE:
         * guardamos en qué playlist está.
         */
        playlistId: playlistActual,
        /*
         * Ponemos la canción al final.
         */
        orden: canciones.length,
      };

      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const addRequest = store.add(datosCancion);
      addRequest.onsuccess = () => {
        /*
         * El ID lo genera IndexedDB.
         */
        canciones.push({
          ...datosCancion,
          id: addRequest.result,
          fuente: url,
        });
        actualizarPlaylist();
        /*
         * Si es la primera canción de la playlist,
         * la cargamos en el reproductor.
         */
        if (canciones.length === 1) {
          indiceCancionActual = 0;
          actualizarInfoCancion();
        }
      };
    });

    console.log("Se han añadido correctamente");
    sacarTargeta();
    /*
     * Limpiamos el input para poder volver
     * a seleccionar el mismo archivo.
     */
    e.target.value = "";
  });

/* =========================================================
   MOSTRAR PLAYLIST
   ========================================================= */

function actualizarPlaylist() {
  playListContainer.innerHTML = "";

  if (canciones.length === 0) {
    const liVacia = document.createElement("li");
    liVacia.id = "playlist-vacia";
    liVacia.textContent = "Todavía no has añadido ninguna canción";
    playListContainer.appendChild(liVacia);
    return;
  }

  canciones.forEach((cancionItem, index) => {
    const li = document.createElement("li");
    li.dataset.index = index;
    const img = document.createElement("img");

    img.src = cancionItem.imagenUrl;
    img.style.borderRadius = "15px";
    img.style.marginRight = "5px";
    img.classList.add("active");
    const span = document.createElement("span");
    span.textContent = `${cancionItem.titulo} - ${cancionItem.nombre}`;
    const botonBorrar = document.createElement("button");
    botonBorrar.innerHTML = '<i class="bi bi-trash3"></i>';
    botonBorrar.classList.add("boton-borrar");
    const botonMover = document.createElement("button");
    botonMover.innerHTML = '<i class="bi bi-grip-vertical"></i>';
    botonMover.classList.add("boton-mover");
    botonMover.classList.add("boton-mover");
    botonBorrar.addEventListener("click", (event) => {
      event.stopPropagation();
      borrarCancion(cancionItem.id);
    });
    li.appendChild(img);
    li.appendChild(span);
    li.appendChild(botonBorrar);
    li.appendChild(botonMover);
    li.onclick = () => {
      indiceCancionActual = index;
      actualizarInfoCancion();
      reproducirCancion();
      Sara();
    };

    if (index === indiceCancionActual) {
      const divReproduciendo = document.createElement("div");
      divReproduciendo.classList.add("loader");
      span.appendChild(divReproduciendo);
      li.classList.add("active");
      console.log("hola esto esta reproduciendo");
    }

    playListContainer.appendChild(li);
  });
}

/* =========================================================
   BORRAR CANCIÓN
   ========================================================= */

function borrarCancion(id) {
  if (!db) {
    return;
  }
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  store.delete(id);
  transaction.oncomplete = () => {
    canciones = canciones.filter((cancionItem) => cancionItem.id !== id);
    if (indiceCancionActual >= canciones.length) {
      indiceCancionActual = Math.max(0, canciones.length - 1);
    }
    actualizarPlaylist();
    if (canciones.length > 0) {
      actualizarInfoCancion();
    }
  };
}

/* =========================================================
   VARIABLES DEL REPRODUCTOR
   ========================================================= */

let indiceCancionActual = 0;
let modoAleatorio = false;
let modoRepetir = false;

/* =========================================================
   INFORMACIÓN DE LA CANCIÓN
   ========================================================= */

function actualizarInfoCancion() {
  /*
   * Evita el error:
   * Cannot read properties of undefined
   */
  if (canciones.length === 0 || !canciones[indiceCancionActual]) {
    return;
  }

  console.log("esta es mi funcion2");
  tituloCancion.textContent = canciones[indiceCancionActual].titulo;
  nombreArtista.textContent = canciones[indiceCancionActual].nombre;
  cancion.src = canciones[indiceCancionActual].fuente;
  cancion.loop = modoRepetir;
  actualizarPlaylist();
  Sara();

  cancion.addEventListener("loadeddata", function () {});
}

/* =========================================================
   VOLUMEN
   ========================================================= */

controlVolumen.addEventListener("input", function () {
  cancion.volume = controlVolumen.value;
  let valor = ((this.value - this.min) / (this.max - this.min)) * 100;
  this.style.background = `linear-gradient(to right, #FFFAFA ${valor}%, #272727 ${valor}%)`;
});

cancion.addEventListener("volumechange", function () {
  controlVolumen.value = cancion.volume;
});

/* =========================================================
   PROGRESO
   ========================================================= */

cancion.addEventListener("loadedmetadata", function () {
  progreso.max = cancion.duration;
  progreso.value = cancion.currentTime;
  actualizarMinutosRestantes();
});

/* =========================================================
   PLAY / PAUSA
   ========================================================= */

botonReproducirPausar.addEventListener("click", reproducirPausar);

function reproducirPausar() {
  console.log("reproducri");
  if (cancion.paused) {
    reproducirCancion();
  } else {
    pausarCancion();
  }
}

function reproducirCancion() {
  if (canciones.length === 0) {
    return;
  }
  cancion.play();
  const loader = document.querySelector(".loader");
  if (loader) {
    loader.style.animationPlayState = "running";
  }
  iconoControl.classList.add("bi-pause-circle-fill");
  iconoControl.classList.remove("bi-play-circle-fill");
}

function pausarCancion() {
  cancion.pause();
  const loader = document.querySelector(".loader");
  if (loader) {
    loader.style.animationPlayState = "paused";
  }
  iconoControl.classList.remove("bi-pause-circle-fill");
  iconoControl.classList.add("bi-play-circle-fill");
}

/* =========================================================
   TIMEUPDATE
   ========================================================= */

cancion.addEventListener("timeupdate", function () {
  if (!cancion.paused) {
    progreso.value = cancion.currentTime;
    const porcentaje =
      ((progreso.value - progreso.min) / (progreso.max - progreso.min)) * 100;
    progreso.style.background = `linear-gradient(to right, #10CAD5 ${porcentaje}%, #ddd ${porcentaje}%)`;
    actualizarMinutosRestantes();
  }
});

/* =========================================================
   CAMBIAR PROGRESO
   ========================================================= */

progreso.addEventListener("input", function () {
  cancion.currentTime = progreso.value;
  const porcentaje =
    ((progreso.value - progreso.min) / (progreso.max - progreso.min)) * 100;

  progreso.style.background = `linear-gradient(to right, #10CAD5 ${porcentaje}%, #ddd ${porcentaje}%)`;
});

/* =========================================================
   SIGUIENTE
   ========================================================= */

botonAdelante.addEventListener("click", function () {
  if (canciones.length === 0) {
    return;
  }
  console.log(indiceCancionActual);
  if (modoRepetir) {
    cancion.currentTime = 0;
    reproducirCancion();
    return;
  }

  if (modoAleatorio) {
    indiceCancionActual = obtenerIndiceAleatorio();
  } else {
    indiceCancionActual = (indiceCancionActual + 1) % canciones.length;
  }
  actualizarInfoCancion();
  reproducirCancion();
});

/* =========================================================
   ANTERIOR
   ========================================================= */

botonAtras.addEventListener("click", function () {
  if (canciones.length === 0) {
    return;
  }
  console.log(indiceCancionActual);
  if (modoAleatorio) {
    indiceCancionActual = obtenerIndiceAleatorio();
  } else {
    indiceCancionActual =
      (indiceCancionActual - 1 + canciones.length) % canciones.length;
  }
  actualizarInfoCancion();
  reproducirCancion();
});

/* =========================================================
   ALEATORIO
   ========================================================= */

botonAleatorio.addEventListener("click", function () {
  modoAleatorio = !modoAleatorio;
  console.log(modoAleatorio);
  botonAleatorio.classList.toggle("active");
  cancion.loop = modoRepetir;
});

/* =========================================================
   CANCIÓN TERMINADA
   ========================================================= */

cancion.addEventListener("ended", function () {
  if (canciones.length === 0) {
    return;
  }
  if (modoRepetir) {
    cancion.currentTime = 0;
    reproducirCancion();
    return;
  }

  if (modoAleatorio) {
    indiceCancionActual = obtenerIndiceAleatorio();
  } else {
    indiceCancionActual = (indiceCancionActual + 1) % canciones.length;
  }
  actualizarInfoCancion();
  reproducirCancion();
});

/* =========================================================
   OBTENER ÍNDICE ALEATORIO
   ========================================================= */

function obtenerIndiceAleatorio() {
  if (canciones.length === 0) {
    return 0;
  }
  let nuevoIndice;
  do {
    nuevoIndice = Math.floor(Math.random() * canciones.length);
  } while (nuevoIndice === indiceCancionActual && canciones.length > 1);
  return nuevoIndice;
}

/* =========================================================
   REPETIR
   ========================================================= */

botonRepetir.addEventListener("click", function () {
  console.log("entrando");
  modoRepetir = !modoRepetir;
  botonRepetir.classList.toggle("active");
  cancion.loop = modoRepetir;
});

/* =========================================================
   MINUTOS RESTANTES
   ========================================================= */

function actualizarMinutosRestantes() {
  if (!Number.isFinite(cancion.duration)) {
    return;
  }
  let tiempoRestante = cancion.duration - cancion.currentTime;
  let minutos = Math.floor(tiempoRestante / 60);
  let segundos = Math.floor(tiempoRestante % 60)
    .toString()
    .padStart(2, "0");

  divMinutos.textContent = `${minutos} : ${segundos}`;
}

/* =========================================================
   SORTABLE
   ========================================================= */

function inicializarSortable() {
  /*
   * Evitamos crear varios Sortable
   * sobre el mismo elemento.
   */
  if (playListContainer._sortable) {
    playListContainer._sortable.destroy();
  }

  playListContainer._sortable = new Sortable(playListContainer, {
    animation: 150,
    handle: ".boton-mover",
    onEnd: function (event) {
      if (event.oldIndex === undefined || event.newIndex === undefined) {
        return;
      }
      const elementoMovido = canciones.splice(event.oldIndex, 1)[0];
      canciones.splice(event.newIndex, 0, elementoMovido);
      console.log("Nuevo orden:", canciones);
      if (!db) {
        return;
      }
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      canciones.forEach((cancionItem, index) => {
        cancionItem.orden = index;

        store.put(cancionItem);
      });
    },
  });
}
