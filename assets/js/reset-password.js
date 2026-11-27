
const SUPABASE_URL = "https://etfqfyyoagsyiwafziji.supabase.co";

// Copy the same public publishable key from admin.js
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RDrPK0Kus5rKT5v3ioaZ5Q_H3YdfAyp";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

const form = document.getElementById("reset-form");
const message = document.getElementById("reset-message");
const button = document.getElementById("reset-button");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    message.textContent = "";

    const password = document.getElementById("new-password").value;
    const confirmPassword = document.getElementById("confirm-password").value;

    if (password !== confirmPassword) {
        message.textContent = "Passwords do not match.";
        return;
    }

    if (password.length < 12) {
        message.textContent = "Password must be at least 12 characters.";
        return;
    }

    button.disabled = true;
    button.textContent = "Updating...";

    try {
        const { data: sessionData, error: sessionError } =
            await supabaseClient.auth.getSession();

        if (sessionError || !sessionData.session) {
            throw new Error(
                "Recovery session is missing or expired. Request a new recovery link."
            );
        }

        const { error } = await supabaseClient.auth.updateUser({
            password: password
        });

        if (error) throw error;

        message.textContent =
            "Password updated successfully. You can now log in.";

        form.reset();

    } catch (error) {
        message.textContent = error.message;
    } finally {
        button.disabled = false;
        button.textContent = "Update Password";
    }
});
