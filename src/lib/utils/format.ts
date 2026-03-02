export const formatNumero = (valore: number, decimali = 0): string =>
  new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali
  }).format(valore);

