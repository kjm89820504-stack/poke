# Pika Runner

피카츄 이미지로 플레이하는 5스테이지 장애물 달리기 게임입니다. 기본 설정은 스테이지당 300초, 총 5스테이지입니다. 스페이스바를 공중에서 한 번 더 누르면 더블점프할 수 있습니다.

## 구성

- `index.html`, `styles.css`, `game.js`: 캔버스 게임 본체
- `assets/pikachu.png`: 사용자가 제공한 캐릭터 이미지 위치
- `firebase-client.js`, `firebase-config.js`: Firebase Realtime Database 이벤트 기록
- `database.rules.json`, `firebase.json`: Firebase Realtime Database 규칙과 배포 설정
- `vercel.json`: Vercel 정적 배포 설정

## 이미지 추가

제공한 이미지를 아래 경로로 저장하세요.

```text
assets/pikachu.png
```

투명 배경 PNG가 가장 자연스럽습니다. 검은 배경 이미지도 게임 시작 시 가장자리와 연결된 검은 배경을 투명 처리합니다. 공개 GitHub 저장소에 올릴 때는 이미지 사용 권한을 확인하세요.

## 로컬 실행

Python이 있으면 프로젝트 폴더에서 바로 실행할 수 있습니다.

```bash
python -m http.server 5173
```

브라우저에서 `http://localhost:5173`을 엽니다.

테스트 시간을 줄이고 싶으면 URL에 `?stageSeconds=20`을 붙이면 됩니다. 배포 기본값은 300초입니다.

## Firebase Realtime Database 연결

프로젝트 ID는 `game-fd2bd`로 설정해두었습니다. Realtime Database 인스턴스는 `game-fd2bd-default-rtdb` 기준입니다.

1. Firebase 콘솔에서 웹 앱 설정을 복사합니다.
2. `firebase-config.example.js`를 참고해서 `firebase-config.js`에 실제 값을 넣습니다.
3. Realtime Database URL이 다르면 `databaseURL`만 실제 콘솔 값으로 바꿉니다.
4. Firebase CLI로 규칙을 배포합니다.

```bash
firebase deploy --only database
```

게임은 `runs` 경로에 스테이지 시작, 성공, 실패, 전체 클리어 이벤트만 생성합니다. 읽기, 수정, 삭제는 규칙에서 차단됩니다.

## Vercel 배포

GitHub에 이 폴더 내용을 올린 뒤 Vercel에서 저장소를 Import 하면 됩니다. 프레임워크 프리셋은 Other/Static으로 두고 별도 빌드 명령 없이 배포할 수 있습니다.
