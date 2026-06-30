---
kind: be
status: in-progress
pattern: DM
depends: [be/grade]
---

# payment

*결제를 승인하고 승인 직후 등급 산정을 호출하는 도메인.*

## 구성
- 데이터.md — 결제 테이블 + 상태 enum
- 기능_결제승인.md — 결제를 승인하고 등급 산정을 호출

## 패턴 (BE 도메인만)
- 채택: DM — 승인 상태 전이·불변식이 있다.

## 책임지지 않는 것
- 주문 생성(be/order 소유).
- 등급 규칙(be/grade 소유).
