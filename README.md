# TornPDA UserScripts

```json
TornPDA { ExecutePlus, RacingPlus }
```

## Quickstart

- Requirements: Node.js and npm installed.
- Setup:

```bash
npm install
```

- Build once:

```bash
npm run build
```

- Develop with watch (build then monitor):

```bash
npm run start
```

- Install in Tampermonkey:
	- Use the install links below to add the scripts directly from `dist/`.
	- Or Tampermonkey → Utilities → Install from URL → paste the raw `dist/*.user.js` URL.
	- Or Tampermonkey → Add a new script → paste contents from the built file in `dist/`.

- Notes:
	- Styles are authored in SCSS and inlined via the `__MINIFIED_CSS__` placeholder during build.
	- Common.js was removed; no external `@require` is needed.

## Execute+ v0.99.0

Show level when execute will be effective.
[Install Execute+ User Script](https://raw.githubusercontent.com/moldypenguins/TornPDA/refs/heads/main/dist/ExecutePlus.user.js)

### Screenshots

![execute](.github/images/execute.png)

## Racing+ v0.99.49

Show racing skill, current speed, race results, precise skill, upgrade parts.
[Install RacingPlus User Script](https://raw.githubusercontent.com/moldypenguins/TornPDA/refs/heads/main/dist/RacingPlus.user.js)

### Screenshots

#### Options

* Changed menu location
* Added new options
* TornPDA: API Key can be changed from *Advanced browser settings > Manage scripts*

![options](.github/images/options.png)

#### Racing

* Adjusted display

![racing](.github/images/racing.png)

#### Enlisted

* moved total races to races won.
* changed total races to race win rate.

![enlisted](.github/images/enlisted.png)

#### Parts

* List parts bought of total parts
* Added color coded parts available list
* Associated parts have the same color header
* Added active bought part and bought parts

![parts](.github/images/parts.png)

![parts](.github/images/parts2.png)

#### Desktop

* Fixed top banner look

![desktop](.github/images/desktop.png)
