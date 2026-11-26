
// ==================================================
// PHASE 1 COURSE - REGISTRATION SYSTEM
// ==================================================

const SUPABASE_URL = "https://etfqfyyoagsyiwafziji.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RDrPK0Kus5rKT5v3ioaZ5Q_HY3dfAyp";
const COURSE_BATCH_ID = "5b1c2d61-dc49-4dc2-b9a6-92ce716eaeff";

const form = document.getElementById("registration-form");
const submitButton = document.getElementById("submit-registration");
const messageBox = document.getElementById("registration-message");

if (form && submitButton && messageBox) {

    submitButton.addEventListener("click", async (event) => {

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

            // Send registration to Supabase
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
            messageBox.className = "success-message";
            messageBox.replaceChildren();

            const heading = document.createElement("strong");
            heading.className = "success-heading";
            heading.textContent = "✓ REGISTRATION COMPLETED";

            const description = document.createElement("p");
            description.textContent =
                "Your registration has been successfully submitted.";

            const numberLabel = document.createElement("span");
            numberLabel.className = "registration-number-label";
            numberLabel.textContent = "YOUR REGISTRATION NUMBER";

            const number = document.createElement("strong");
            number.className = "registration-number-highlight";
            number.textContent =
                result.registration_number || "Not provided";

            const reminder = document.createElement("p");
            reminder.className = "registration-reminder";
            reminder.textContent =
                "Please save this number for future reference.";

            messageBox.append(
                heading,
                description,
                numberLabel,
                number,
                reminder
            );

            // Clear form after successful registration
            form.reset();

        } catch (error) {

            messageBox.textContent =
                error.message || "Something went wrong. Please try again.";

            messageBox.className = "error-message";

        } finally {

            // Reset CAPTCHA
            if (window.turnstile) {
                window.turnstile.reset();
            }

            submitButton.disabled = false;
            submitButton.textContent = "Submit Registration";
        }
    });
}
