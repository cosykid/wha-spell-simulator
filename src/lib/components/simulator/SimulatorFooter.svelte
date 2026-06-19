<!--
@component
Static attribution and fan-project disclaimer.

Kept as a component so the route template can focus on simulator composition
instead of carrying legal copy inline.
-->
<footer class="app-footer">
	<p>
		Unofficial fan-made spell diagram simulator inspired by Witch Hat Atelier. This project is not
		affiliated with, endorsed by, or sponsored by the official creators, publishers, licensors, or
		production partners.
	</p>
	<p>
		Witch Hat Atelier and related names, artwork, symbols, and trademarks belong to their respective
		rights holders. The sigils, signs, and spell effects here are partial fan references and
		programming-language interpretations for learning and experimentation.
	</p>
</footer>

<style>
	.app-footer {
		display: grid;
		gap: 4px;
		margin-top: 14px;
		color: rgba(255, 249, 232, 0.78);
		font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
		font-size: 12px;
		line-height: 1.4;
	}

	.app-footer p {
		margin: 0;
	}
</style>
