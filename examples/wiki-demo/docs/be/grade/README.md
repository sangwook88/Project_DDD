---
kind: be
status: in-progress
pattern: TS
depends: []
---

# grade

*결제 누적 금액으로 회원 등급을 산정하는 말단 도메인.*

## 구성
- 기능_등급산정.md — 누적 결제로 등급을 계산

## 패턴 (BE 도메인만)
- 채택: TS — 단순 구간 매핑.

## 책임지지 않는 것
- 결제 승인(be/payment 소유).
- 주문 생성(be/order 소유).
