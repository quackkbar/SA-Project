import prisma from './prisma';

/**
 * Fetch the next sequence formatted ID from PostgreSQL.
 * Format: Prefix + 5 digits (e.g. CUS00001, SO00001, PRD00001)
 */
export async function getNextId(
  sequenceName: string,
  prefix: string,
  tx?: any
): Promise<string> {
  const client = tx || prisma;
  try {
    const result: any = await client.$queryRawUnsafe(
      `SELECT '${prefix}' || LPAD(NEXTVAL('public.${sequenceName}')::TEXT, 5, '0') AS next_id;`
    );
    return result[0]?.next_id;
  } catch (err) {
    // Fallback for offline/test environments if sequence doesn't exist
    const randomNum = Math.floor(10000 + Math.random() * 89999);
    return `${prefix}${randomNum}`;
  }
}
