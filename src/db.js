import Dexie from 'dexie';

export const db = new Dexie('KaraokeDB');

db.version(1).stores({
    myLibrary: '++id, title, artist, genre, cover_url'
    // fileBlob no se indexa, pero se guarda igual
});
