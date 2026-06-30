import { GradeService } from "../grade/grade_service";

// 결제 승인 + 등급 산정 호출. 위키 계약(기능_결제승인.md)의 구현 골격.
export class PaymentApprover {
  constructor(private readonly grade: GradeService) {
  }

  async approve(orderId: string, amount: number): Promise<{ paymentId: string; status: string }> {
    this.validate(amount);
    const ok = await this.callPG(orderId, amount);
    return { paymentId: orderId, status: ok ? "APPROVED" : "DECLINED" };
  }

  private validate(amount: number): void {
    if (amount <= 0) throw new Error("amount must be positive");
  }

  private async callPG(orderId: string, amount: number): Promise<boolean> {
    return amount > 0;
  }
}
