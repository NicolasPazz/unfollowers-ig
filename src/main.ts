import "dotenv/config";
import readline from "readline";
import { chromium } from "playwright";
import { getFollowers, getFollowing, getUnfollowers } from "./utils.ts";

const username = process.env.IG_USERNAME;
if (!username) throw new Error("IG_USERNAME no definido en .env");

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

function preguntar(): Promise<string> {
	return new Promise((resolve) => {
		console.log(`\n¿Qué acción querés ejecutar?\n`);
		console.log(`1) Obtener followers`);
		console.log(`2) Obtener following`);
		console.log(`3) Obtener unfollowers`);
		console.log(`4) Hacer unfollow a los unfollowers`);
		console.log(`5) Ejecutar 1, 2 y 3\n`);

		rl.question("Elegí una opción (1-5): ", (respuesta) => {
			resolve(respuesta.trim());
		});
	});
}

(async () => {
	const opcion = await preguntar();

	rl.close();

	const browser = await chromium.launch({ headless: false });
	const context = await browser.newContext();
	const page = await context.newPage();

	switch (opcion) {
		case "1":
			await getFollowers(page, username);
			break;
		case "2":
			await getFollowing(page, username);
			break;
		case "3":
			await getUnfollowers();
			break;
		case "4":
			//await unfollow(page);
			break;
		case "5":
			await getFollowers(page, username);
			await getFollowing(page, username);
			await getUnfollowers();
			break;
		default:
			console.log("❌ Opción no válida. Terminando...");
			break;
	}

	await browser.close();
})();
