# HOME — wiki-demo 도메인 지도

주문 → 결제 → 등급 체인을 보여주는 영구 예제 위키다.
세 스크립트(home-check / context-pack / code-map)의 회귀 픽스처로 쓴다.

## BE 도메인

| slug | 역할 | 상태 |
| --- | --- | --- |
| be/order | 주문을 받아 결제를 호출한다 | in-progress |
| be/payment | 결제를 승인하고 등급 산정을 호출한다 | in-progress |
| be/grade | 결제 누적으로 회원 등급을 산정한다 | in-progress |

## 참조 그래프

- be/order → be/payment
- be/payment → be/grade
