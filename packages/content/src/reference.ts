import constants from '../reference/constants.json';
import labs from '../reference/labs.json';
import periodic from '../reference/periodic-table.json';

export const LAB_VALUES = labs as { note: string; sections: { name: string; rows: [string, string][] }[] };
export const CONSTANTS = constants as [string, string][];
export const PERIODIC_TABLE = periodic as { z: number; symbol: string; name: string; mass: number; group: number; period: number }[];
