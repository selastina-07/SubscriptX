import DemoCheckout from "./DemoCheckout";

export const instant = false;

export default async function DemoCheckoutPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <DemoCheckout orderId={orderId} />;
}
