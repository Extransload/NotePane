.PHONY: help install icons build verify run app app-mac app-win dev-web dev-app

help:
	@echo "NotePane commands"
	@echo ""
	@echo "  make install  Install npm dependencies"
	@echo "  make icons    Generate PNG and ICNS app icons from assets/notepane-icon.png"
	@echo "  make build    Build the Vite renderer"
	@echo "  make verify   Build and run unit/static/E2E smoke checks"
	@echo "  make run      Build and run the NotePane desktop app"
	@echo "  make app      Build an app package for the current OS"
	@echo "  make app-mac  Build macOS dmg and zip packages (arm64 and x64)"
	@echo "  make app-win  Build a Windows NSIS app package"
	@echo ""
	@echo "Development:"
	@echo "  make dev-web  Start Vite dev server"
	@echo "  make dev-app  Start Electron against http://127.0.0.1:5173"

install:
	npm install
	npm run install:browsers

icons:
	npm run icons

build:
	npm run build

verify:
	npm run verify

run:
	npm start

app:
	npm run app

app-mac:
	npm run app:mac

app-win:
	npm run app:win

dev-web:
	npm run dev:web

dev-app:
	npm run dev:app
