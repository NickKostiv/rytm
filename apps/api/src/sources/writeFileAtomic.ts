import { rename, writeFile } from 'node:fs/promises';

export const writeFileAtomic = async (path: string, data: string | Uint8Array): Promise<void> => {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, data);
  await rename(temporaryPath, path);
};
