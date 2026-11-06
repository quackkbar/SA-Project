import prisma from './prisma';

/**
 * Re-calculate Sales Order Status according to Centralized R1 logic.
 * Invokes public.fn_recalculate_sales_order_status(salesOrderId) in PostgreSQL.
 */
export async function recalculateSalesOrderStatus(salesOrderId: string, tx?: any) {
  const client = tx || prisma;
  try {
    const result = await client.$queryRaw`
      SELECT public.fn_recalculate_sales_order_status(${salesOrderId}) as new_status;
    `;
    return (result as any)?.[0]?.new_status;
  } catch (err) {
    console.error(`Error recalculating status for order ${salesOrderId}:`, err);
    throw err;
  }
}
