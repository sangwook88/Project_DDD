# wiki-demo — 영구 예제 위키 + 회귀 픽스처

주문 → 결제 → 등급 체인을 담은 **최소 예제 위키**다. 세 스크립트
(`home-check` / `context-pack` / `code-map`)가 실제로 어떻게 동작하는지 보여주고,
동시에 `test/` 회귀 테스트의 고정 픽스처로 쓰인다.

## 구조

```
examples/wiki-demo/
  docs/
    HOME.md                 # ## BE 도메인 표 + ## 참조 그래프
    be/order/               # README + 데이터 + 기능_주문생성  (depends: be/payment)
    be/payment/             # README + 데이터(테이블·enum) + 기능_결제승인  (depends: be/grade)
    be/grade/               # README + 기능_등급산정  (depends: 없음)
  src/
    be/order/order_service.ts        # 주문 → 결제 호출
    be/payment/PaymentApprover.ts    # 결제 승인 클래스(TS)
    be/grade/grade_service.py        # 등급 산정(Python — 다언어 폴백 예제)
```

참조 그래프: `be/order → be/payment → be/grade` (단방향·비순환).

코드는 `code:` override 없이 **기본 규약 `src/<slug>`** 를 그대로 쓴다.
`--root examples/wiki-demo/docs` 로 호출하면 code-root 기본값이 `examples/wiki-demo`
(docs 의 상위)가 되어 `src/be/<name>` 을 자동으로 찾는다.

## 세 스크립트 돌려보기

레포 루트에서:

```bash
# 1) HOME 그래프 ↔ 폴더 현실 정합성 + 코드 폴더 존재 검증 (exit 0 = 일치)
node scripts/home-check.mjs --root examples/wiki-demo/docs

# 2) 컨텍스트 팩 — be/payment 타깃, 부르는 쪽(down) 압축
node scripts/context-pack.mjs --root examples/wiki-demo/docs --target be/payment --direction down

# 3) 컨텍스트 팩 + 타깃 코드 골격(Tier B) append
node scripts/context-pack.mjs --root examples/wiki-demo/docs --target be/payment --with-code

# 4) 코드 골격만 직접 추출
node scripts/code-map.mjs --dir examples/wiki-demo/src/be/payment
```

## 회귀 테스트 실행

레포 루트에서 node 내장 러너로:

```bash
npm test
# 또는 직접:
node --test "test/**/*.test.mjs"
```

> 참고: `node --test test/`(디렉토리 단축형)은 일부 Node 버전에서 `test` 를
> 모듈로 오인해 실패한다. 위 glob 형태를 쓴다(package.json `npm test` 와 동일).

테스트는 이 예제를 픽스처로 home-check(정상·엣지 불일치·코드 누락),
context-pack(티어 슬라이싱·--with-code), code-map 을 검증한다. 변형이 필요한
케이스는 OS 임시 디렉토리에 예제를 복사해 변형하므로 이 폴더는 더럽혀지지 않는다.
