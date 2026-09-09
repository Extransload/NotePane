# NotePane 협업·동기화 전환 설계 초안

> 상태: 제안 문서. 이 문서는 구현이나 데이터 이전을 수행하지 않는다.

## 1. 목적

NotePane을 기기 하나에 저장되는 개인 노트 앱에서, 계정·워크스페이스·권한을 바탕으로 여러 사용자가 문서를 안전하게 공유하는 앱으로 확장한다.

첫 목표는 **워크스페이스에 초대된 멤버가 그 워크스페이스의 모든 노트를 권한에 맞게 열고 수정할 수 있는 것**이다. OAuth는 로그인 수단일 뿐, 공유·권한·동기화 문제를 해결하지 않는다는 점을 전제로 한다.

## 2. 현재 상태와 전환 이유

현재 앱은 Electron `StickyStore`가 사용자 기기의 `notes.json`에 다음을 저장한다.

- 노트의 BlockNote `blocksJSON`과 Markdown fallback
- 제목, 테마, 창 상태, 정렬, 휴지통 및 버전 기록
- 이미지·파일의 data URL 본문

이 구조는 오프라인 개인 메모에는 단순하고 안전하지만, 다른 사용자·다른 기기와의 공유에는 한계가 있다.

- 계정 식별자와 서버 권한 주체가 없다.
- 여러 기기가 같은 파일을 수정하면 충돌을 판별할 수 없다.
- data URL 자산은 `notes.json`을 과도하게 키우고 부분 동기화·전송 재개가 어렵다.
- 백업 파일을 전달하는 방식은 실시간 공유, 초대 취소, 접근 감사에 맞지 않는다.

## 3. 제품 경계

### 3.1 첫 출시 범위

- OAuth 로그인: Google을 우선 지원하고, GitHub 등은 공급자 추가 방식으로 확장
- 개인 워크스페이스와 팀 워크스페이스
- 워크스페이스 단위의 전체 노트 공유
- owner / admin / member / viewer 역할
- 이메일 또는 계정 식별자 기반 초대·수락·취소
- 노트와 자산의 서버 동기화, 오프라인 변경 큐, 버전 기록
- 동일 노트의 동시 편집 시 충돌 없는 동기화

### 3.2 첫 출시에서 제외할 항목

- 링크만 아는 누구나 접근 가능한 공개 공유
- 외부 게스트가 일부 블록만 편집하는 세밀한 블록 권한
- 조직 SSO(SAML/SCIM), 도메인 강제 가입
- 법적 보존·eDiscovery·DLP

이 항목들은 워크스페이스·멤버십 모델이 안정된 뒤 별도 설계한다.

## 4. 핵심 용어와 권한

| 용어 | 의미 |
| --- | --- |
| 사용자 | OAuth 로그인으로 식별되는 사람. 내부 `userId`를 갖는다. |
| 워크스페이스 | 노트, 자산, 멤버, 초대, 정책의 최상위 소유 단위. |
| 멤버십 | 사용자와 워크스페이스의 역할·상태를 연결하는 레코드. |
| 노트 | 정확히 하나의 워크스페이스에 속하는 문서. |
| 자산 | 이미지·첨부 파일의 원본 바이너리와 메타데이터. |
| 초대 | 수신자가 수락하기 전의 권한 제안. 만료·취소 가능해야 한다. |

| 역할 | 노트 열람 | 노트 수정 | 멤버 초대/삭제 | 역할 변경 | 워크스페이스 삭제 |
| --- | --- | --- | --- | --- | --- |
| Owner | 가능 | 가능 | 가능 | 가능 | 가능 |
| Admin | 가능 | 가능 | 가능 | Member/Viewer만 | 불가 |
| Member | 가능 | 가능 | 불가 | 불가 | 불가 |
| Viewer | 가능 | 불가 | 불가 | 불가 | 불가 |

권한의 기본 단위는 워크스페이스다. 특정 노트만 비공개로 둘 필요가 생기면 이후 `note_acl`을 추가하되, 초기에는 개인 워크스페이스와 팀 워크스페이스를 분리하는 편이 예측 가능하다.

## 5. 제안 아키텍처

```text
Electron renderer ── authenticated IPC ── Electron main
        │                                      │
        └──────── HTTPS / WebSocket ───────────┴── API service
                                                   ├── relational DB
                                                   ├── object storage
                                                   ├── realtime sync service
                                                   └── background workers
```

### 5.1 클라이언트 책임

- BlockNote는 편집 화면과 로컬 문서 상태를 유지한다.
- 로컬 DB/파일 캐시는 오프라인 열람·수정 및 전송 대기 변경을 보관한다.
- access token은 Electron main process 또는 OS credential store에서 관리한다. renderer에 장기 토큰을 노출하지 않는다.
- sync engine은 서버 revision을 받고, 로컬 변경을 순서대로 업로드하며, 실패 시 재시도한다.

### 5.2 서버 책임

- OAuth callback, 세션·토큰 갱신, 계정 연결
- 워크스페이스·멤버십·초대·권한의 유일한 판정
- 노트 metadata, revision, audit event 저장
- 원본 자산 저장 및 서명된 업로드/다운로드 URL 발급
- 실시간 변경 브로드캐스트와 충돌 처리

클라이언트가 보내는 `workspaceId`, `role`, `userId`는 신뢰하지 않는다. 모든 API는 서버 세션의 사용자와 멤버십을 다시 확인해야 한다.

## 6. 데이터 모델 초안

| 테이블/컬렉션 | 핵심 필드 | 목적 |
| --- | --- | --- |
| users | id, email, display_name, created_at | OAuth 공급자와 분리된 내부 사용자 |
| oauth_identities | user_id, provider, provider_subject | Google/GitHub 계정 연결 |
| workspaces | id, name, owner_id, policy, created_at | 소유·정책 단위 |
| workspace_members | workspace_id, user_id, role, status, joined_at | 현재 멤버와 역할 |
| workspace_invites | id, workspace_id, email, role, token_hash, expires_at, accepted_at, revoked_at | 초대 수명주기 |
| notes | id, workspace_id, title, current_revision_id, deleted_at | 문서 메타데이터 |
| note_revisions | id, note_id, revision_no, content_ref, author_id, created_at | 복구·감사·동기화 기준점 |
| note_operations | note_id, client_id, sequence, operation, created_at | 실시간 편집 연산 로그 또는 CRDT update |
| assets | id, workspace_id, object_key, content_type, size, checksum, encryption_ref | 원본 이미지·파일 |
| audit_events | workspace_id, actor_id, action, target_type, target_id, created_at | 초대·권한·삭제·다운로드 감사 |

삭제는 바로 영구 삭제하지 않고 `deleted_at`을 둔 휴지통 상태로 시작한다. 보존 기간과 영구 삭제 권한은 워크스페이스 정책으로 결정한다.

## 7. 파일 저장 시스템 개편

### 7.1 노트 본문

- `blocksJSON`은 서버의 canonical 편집 형식으로 보관한다.
- Markdown은 export/interoperability용 파생 데이터로 두며, 동시 편집 병합의 기준으로 쓰지 않는다.
- 큰 본문은 revision snapshot + operation delta로 저장한다.
- 전송 시 gzip 또는 zstd 압축을 사용한다. 압축 전 크기, 압축 후 크기, 콘텐츠 해시를 기록한다.

### 7.2 이미지와 첨부 파일

- data URL을 노트 JSON에 계속 포함하지 않는다.
- 업로드 전 SHA-256 체크섬을 산출해 중복 업로드와 전송 손상을 탐지한다.
- object storage에 `workspaceId/assetId/original`처럼 추측 어려운 키로 저장한다.
- 클라이언트는 API에서 짧은 만료 시간의 서명 URL을 받아 직접 업로드한다.
- 썸네일·변환 파일은 원본 자산과 별도 버전으로 저장한다.

### 7.3 로컬 캐시와 이전

- 기존 `notes.json`은 즉시 삭제하지 않고 읽기 전용 백업으로 유지한다.
- 첫 로그인 시 사용자가 가져올 로컬 노트와 대상 워크스페이스를 선택한다.
- 가져오기는 idempotent migration ID를 가지며, 중단 후 재개 가능해야 한다.
- 동기화 완료 전에도 로컬 캐시로 편집 가능하되, 화면에 `동기화 대기` 상태를 표시한다.

## 8. 암호화와 비밀 관리

### 8.1 기본 보안

- 전송: TLS만 허용한다.
- 저장: DB와 object storage의 서버 측 암호화(KMS 관리 키)를 기본으로 한다.
- 토큰: OS Keychain/Credential Manager에 보관하고, 로그·crash report·renderer state에 기록하지 않는다.
- 초대 토큰: 원문이 아니라 해시만 저장하고, 1회 수락·만료·취소를 지원한다.
- 자산 URL: 공개 URL이 아닌 권한 검증 후 발급하는 짧은 TTL 서명 URL을 사용한다.

### 8.2 종단간 암호화(E2EE) 결정

E2EE는 “서버도 본문을 읽지 못하게” 하는 별도 제품 결정이다. 이를 선택하면 검색, 서버 렌더링, 분실 계정 복구, 멤버 초대/제거 시 키 재암호화가 모두 복잡해진다.

따라서 첫 단계는 서버 측 암호화 + 엄격한 권한 모델을 권장한다. E2EE가 필요한 고객군이 확인되면 워크스페이스 키, 멤버별 키 래핑, 기기 키 회전, 멤버 퇴장 후 re-key까지 별도 설계한다.

## 9. OAuth, 초대, 수락 흐름

1. 사용자가 OAuth로 로그인한다.
2. 서버는 공급자 subject를 기존 `oauth_identities`와 연결하거나 새 `user`를 만든다.
3. Owner/Admin이 이메일과 역할을 지정해 초대한다.
4. 서버는 만료된 단일 사용 초대 링크를 발행하고 audit event를 기록한다.
5. 수신자는 로그인 후 이메일 일치 여부를 확인하고 초대를 수락/거절한다.
6. 수락 성공 시 `workspace_members.status=active`가 되며, 클라이언트가 해당 워크스페이스의 노트 목록을 동기화한다.
7. 초대 취소·멤버 제거·역할 강등 시 서버는 즉시 새 요청을 거절하고 연결된 realtime session도 해제한다.

## 10. 워크스페이스와 멤버 관리 화면

### 워크스페이스 전환기

- 현재 워크스페이스 이름과 역할
- 개인/팀 워크스페이스 목록
- 새 워크스페이스 생성, 이름 변경, 나가기
- Owner 전용: 소유권 이전, 워크스페이스 삭제

### 멤버 관리

- 멤버 이름·이메일·역할·가입일·최근 활동
- 초대 대기 상태, 재전송, 취소, 만료 표시
- 역할 변경과 멤버 제거 전 확인 대화상자
- 모든 관리 행동에 audit event 기록

이 UI는 NotePane의 기존 Preferences와 분리된 `Workspace settings` 영역으로 두는 편이 좋다. 일반 노트 편집 중 권한 제어가 갑자기 섞이지 않는다.

## 11. 동기화와 동시 수정

### 11.1 기본 동기화 상태

클라이언트는 각 노트에 다음 상태를 보여야 한다.

- Synced: 서버 revision과 로컬 상태가 같음
- Syncing: 업로드/다운로드 중
- Pending offline: 네트워크 없이 로컬 변경이 쌓임
- Conflict/recovery needed: 자동 병합하지 못한 상태
- Access removed: 권한 회수로 더 이상 열 수 없음

### 11.2 동시 편집 전략

| 방식 | 장점 | 주의점 |
| --- | --- | --- |
| 마지막 저장 우선 | 구현이 빠름 | 다른 사람의 변경을 조용히 덮어씀. 채택하지 않음. |
| revision + 3-way merge | 문서 단위 동기화에 비교적 단순 | BlockNote 구조 병합과 커서 동기화가 약함. |
| CRDT(Yjs 등) | 오프라인·동시 편집·커서/선택 표시에 적합 | provider, update 저장, snapshot/compaction 설계 필요. |

권장 방향은 BlockNote와 연결 가능한 CRDT provider를 사용하고, 서버에는 CRDT update log와 주기적 snapshot을 저장하는 것이다. 모든 편집을 문자열 Markdown 병합으로 처리하면 표, 이미지, 블록 ID, 중첩 구조에서 데이터 손실 위험이 크다.

### 11.3 버전과 복구

- 자동 snapshot: 일정 시간 또는 일정 update 수마다 생성
- 수동 version history: 현재 기능을 서버 revision history로 확장
- 복구는 새 revision을 생성하며 기존 revision을 덮어쓰지 않음
- 누가 언제 어떤 역할로 변경했는지 audit event와 연결

## 12. API 경계 초안

```text
POST   /auth/oauth/:provider/start
GET    /auth/oauth/:provider/callback
POST   /auth/logout
GET    /me

GET    /workspaces
POST   /workspaces
PATCH  /workspaces/:workspaceId
DELETE /workspaces/:workspaceId

GET    /workspaces/:workspaceId/members
POST   /workspaces/:workspaceId/invites
POST   /invites/:token/accept
DELETE /workspaces/:workspaceId/invites/:inviteId
PATCH  /workspaces/:workspaceId/members/:userId
DELETE /workspaces/:workspaceId/members/:userId

GET    /workspaces/:workspaceId/notes
GET    /notes/:noteId
PATCH  /notes/:noteId
POST   /notes/:noteId/revisions

POST   /assets/upload-intents
GET    /assets/:assetId/download-intent
WS     /realtime/workspaces/:workspaceId
```

모든 workspace/note/asset endpoint는 서버에서 멤버십과 역할을 판정한다. 클라이언트의 화면 제어는 UX일 뿐 보안 경계가 아니다.

## 13. 단계별 도입 계획

| 단계 | 결과물 | 선행 결정 |
| --- | --- | --- |
| 0 | 현 로컬 포맷 문서화, export/backup 안정화 | canonical blocksJSON, migration 정책 |
| 1 | 계정·OAuth·개인 클라우드 백업 | 제공자, 세션/토큰 보관 방식 |
| 2 | 워크스페이스·멤버·초대·권한 | 역할 표, 초대 이메일, 감사 로그 |
| 3 | 서버 노트·자산 저장과 단방향/양방향 동기화 | 압축, object storage, 오프라인 큐 |
| 4 | revision 충돌 처리와 복구 UI | snapshot 보존 기간 |
| 5 | CRDT 기반 실시간 공동 편집 | realtime provider, compaction, presence |
| 6 | E2EE/조직 SSO 등 고급 정책 | 고객 요구와 운영 역량 |

## 14. 시작 전에 확정할 질문

1. 공유의 기본 단위는 “워크스페이스 전체”만으로 충분한가, 아니면 노트별 비공개가 첫 출시부터 필요한가?
2. Google 로그인만으로 시작해도 되는가, 아니면 GitHub/Apple/이메일 로그인이 필요한가?
3. 사용자당 또는 워크스페이스당 저장 용량·멤버 수 제한은 무엇인가?
4. 외부 서버가 본문을 읽을 수 없는 E2EE가 실제 요구사항인가?
5. 동시에 수정할 때 즉시 보이는 실시간 협업이 필요한가, 아니면 충돌 안내가 있는 동기화만 우선인가?
6. 자산 보존·삭제·백업의 책임과 보존 기간은 어떻게 할 것인가?
7. 기존 로컬 노트를 자동 업로드할지, 사용자가 명시적으로 가져오게 할지?

## 15. 승인 기준

구현을 시작하기 전에는 최소한 다음이 확정되어야 한다.

- 인증 공급자와 계정 복구 정책
- 워크스페이스/노트 공유 경계와 역할표
- 서버 측 암호화 또는 E2EE 선택
- 노트 본문·자산·revision의 보존 및 삭제 정책
- 동시 수정의 목표 수준과 충돌 처리 방식
- 로컬 `notes.json`에서 서버 저장소로의 migration UX
