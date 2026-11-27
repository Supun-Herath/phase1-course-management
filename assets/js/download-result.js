
const DOWNLOAD_FUNCTION =
    "https://etfqfyyoagsyiwafziji.supabase.co/functions/v1/participant-result-download";

const form = document.getElementById("download-form");
const message = document.getElementById("download-message");
const button = document.getElementById("download-button");

function showMessage(text) {
    message.textContent = text;
    message.style.display = "block";
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const registrationNumber =
        document.getElementById("registration-number").value.trim();

    const contactNumber =
        document.getElementById("contact-number").value.trim();

    const captchaToken =
        document.querySelector(
            '[name="cf-turnstile-response"]'
        )?.value;

    if (!captchaToken) {
        showMessage("Please complete the security verification.");
        return;
    }

    button.disabled = true;
    button.textContent = "Verifying details...";

    showMessage("Checking your registration. Please wait.");

    try {
        const response = await fetch(DOWNLOAD_FUNCTION, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                registration_number: registrationNumber,
                contact_number: contactNumber,
                turnstile_token: captchaToken
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success || !data.download_url) {
            throw new Error(
                data.error || "Verification failed. Please try again."
            );
        }

        showMessage("Verified successfully. Opening your result sheet...");

        window.location.assign(data.download_url);

    } catch (error) {
        showMessage(error.message || "Something went wrong.");

        if (window.turnstile) {
            window.turnstile.reset();
        }

    } finally {
        button.disabled = false;
        button.textContent = "Verify & Download Result Sheet";
    }
});
