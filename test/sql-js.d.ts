// sql.js's Node build, for the tests (anki.test.ts).
declare module 'sql.js' {
  const initSqlJs: (config?: object) => Promise<unknown>;
  export default initSqlJs;
}
