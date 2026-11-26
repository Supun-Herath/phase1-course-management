
// Phase 1 Course - Registration System

const SUPABASE_URL = "https://etfqfyyoagsyiwafziji.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RDrPK0Kus5rKT5v3ioaZ5Q_H3YdfAyp";
const COURSE_BATCH_ID = "5b1c2d61-dc49-4dc2-b9a6-92ce716eaeff";

const form = document.getElementById("registration-form");
const submitButton = document.getElementById("submit-registration");
const messageBox = document.getElementById("registration-message");

if (form && submitButton && messageBox) {

    submitButton.addEventListener("click", async () => {

        messageBox.textContent = "";
        messageBox.className = "";

        // Collect registration information
        const registrationData = {
            full_name: document.getElementById("full_name").value.trim(),
            contact_number: document.getElementById("contact_number").value.trim(),
            email: document.getElementById("email").value.trim() || null,
            school_troop: document.getElementById("school_troop").value.trim(),
            district: document.getElementById("district").value.trim(),
            section: document.getElementById("section").value,
            batch_id: COURSE_BATCH_ID
        };

        // Validate required fields
        if (
            !registrationData.full_name ||
            !registrationData.contact_number ||
            !registrationData.school_troop ||
            !registrationData.district ||
            !registrationData.section
        ) {
            messageBox.textContent = "Please complete all required fields.";
            messageBox.className = "error-message";
            return;
        }

        // Read Cloudflare Turnstile token
        const turnstileField = document.querySelector(
            'input[name="cf-turnstile-response"]'
        );

        const turnstileToken = turnstileField
            ? turnstileField.value.trim()
            : "";

        // Check CAPTCHA completion
        if (!turnstileToken) {
            messageBox.textContent =
                "Please complete the security verification.";
            messageBox.className = "error-message";
            return;
        }

        // Disable button while submitting
        submitButton.disabled = true;
        submitButton.textContent = "Submitting...";

        try {

            // Send registration and CAPTCHA token to Supabase
            const response = await fetch(
                `${SUPABASE_URL}/functions/v1/public-registration`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",
                        "apikey": SUPABASE_PUBLISHABLE_KEY
                    },

                    body: JSON.stringify({
                        ...registrationData,
                        turnstile_token: turnstileToken
                    })
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error || "Registration failed."
                );
            }

            // Successful registration
            messageBox.textContent =
                `Registration successful! Your registration number is ${result.registration_number}.`;

            messageBox.className = "success-message";

            form.reset();

        } catch (error) {

            messageBox.textContent =
                error.message || "Something went wrong. Please try again.";

            messageBox.className = "error-message";

        } finally {

            // Reset CAPTCHA for another attempt
            if (window.turnstile) {
                window.turnstile.reset();
            }

            submitButton.disabled = false;
            submitButton.textContent = "Submit Registration";

        }
    });
}
