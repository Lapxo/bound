import * as wire from '@lapxo/topos/wire';

const { matches } = wire;

export const fits = (read: string, coordinate: string): boolean => {
  const glob = read.includes('@') ? read.slice(0, read.indexOf('@')) : read;
  const [bare, tail] = coordinate.endsWith('/') ? [coordinate.slice(0, -1), '/'] : [coordinate, ''];
  const steps = bare.split('/');
  return steps.some((_, i) => matches(glob, `${steps.slice(i).join('/')}${tail}`));
};
