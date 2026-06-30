import { PaymentApprover } from "../payment/PaymentApprover";

// 주문 생성 + 결제 호출. 기능_주문생성.md 구현 골격.
export class OrderService {
  constructor(private readonly payment: PaymentApprover) {
  }

  async create(memberId: string, amount: number): Promise<{ orderId: string; status: string }> {
    const orderId = `ord_${Date.now()}`;
    const res = await this.payment.approve(orderId, amount);
    return { orderId, status: res.status };
  }
}
