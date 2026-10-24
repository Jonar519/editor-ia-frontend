// La IA se carga BAJO DEMANDA (bloque Q, decisión escrita): nada de su código entra en el chunk del
// editor ni en el de la lectura. Este import() es lo único que esas vistas tienen de la IA.
export const cargarIa = () => import('./diferidas/ia.js');
