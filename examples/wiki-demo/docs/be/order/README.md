---
kind: be
status: in-progress
pattern: TS
depends: [be/payment]
---

# order

*주문을 받아 결제 승인을 호출하는 진입 도메인.*

## 구성
- 데이터.md — 주문 테이블
- 기능_주문생성.md — 주문을 만들고 결제를 호출

## 패턴 (BE 도메인만)
- 채택: TS — 절차적 CRUD, 규칙이 얇다.

## 책임지지 않는 것
- 결제 승인 자체(be/payment 소유).
- 등급 산정(be/grade 소유).
