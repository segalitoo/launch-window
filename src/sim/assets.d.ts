// Vite's ?raw import: the file's text. Used for the Tiled maps in maps/.
declare module '*.tmj?raw' {
  const text: string;
  export default text;
}
