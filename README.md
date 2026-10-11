# realassetclass-cards
인스타그램 **부동산 속사정**(@budongsan.soksajeong) 카드뉴스 이미지·게시 큐. 운영 원칙은 `CHANNEL.md`.

## 흐름
1. `bundles/YYYY-MM-DD_week.json`을 올리면 GitHub Actions(`render-cards`)가 슬라이드 HTML을 1080×1350 JPEG로 렌더링
2. 결과: `posts/{date}_{slug}/{n}.jpg`, `queue/{date}.json`, `render/last-report.json`
3. Make 시나리오 6580449가 월·수·금 20:00(KST)에 `queue/오늘날짜.json`을 읽어 인스타 캐러셀로 게시
4. 파일 업로드는 Make 시나리오 6580708(`dest_path` + `source_url` 또는 `content`)

## 번들 형식
```json
{"week":"2026-10-12","handle":"@budongsan.soksajeong","css":"(선택)",
 "posts":[{"date":"2026-10-12","slug":"영문-소문자-하이픈","caption":"캡션(2200자·해시태그 30개 이하)",
   "css":"(선택)","slides":["<section>...</section>", "..."]}]}
```
- 슬라이드는 `<section>`으로 시작. 상단 핸들 / `n / N`은 자동 삽입(`<section data-notop>`이면 생략)
- 사진은 `assets/photos/`에 두고 `url(assets/photos/파일.jpg)`로 참조(저장소 루트 기준). 없는 사진은 렌더 오류
- 표지(1장): `section.photo` + `.ph`(배경 사진) + `.ph-dim` + `.corner`(코너 배지) + `.hook`(큰 문구, `.box` 강조) + `.sub`
- 테마: `section` 기본 남색, `section.cream`, `section.orange`, `section.blue`
- 클래스: `.content .bottom .center .display .mega .h1 .h2 .h3 .lead .body .small .pill(.fill/.blue) .card(.o) .bar>i .next .src .num .o .b`
  차트·리스트: `.dv` 증감 막대, `.vbars`+`.vbars-x` 세로 막대, `.tbl` 표, `.steps` 번호 목록, `.big-no`, `.check`, `.why`
- `queue/{date}.json`이 이미 있으면 그 게시물은 건너뜀(덮어쓰기 방지). 다시 만들려면 post에 `"force": true`

## 릴스
- `node render/reel.mjs reel.json out.mp4` — 사진+텍스트 오버레이로 1080×1920 MP4(음악 없음). 스펙 형식은 파일 상단 주석
- 릴스는 큐에 넣지 않음(직접 음악 넣어 게시)
