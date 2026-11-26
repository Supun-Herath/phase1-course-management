
// Phase 1 Course - Participant Management

const SUPABASE_URL = "https://etfqfyyoagsyiwafziji.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RDrPK0Kus5rKT5v3ioaZ5Q_H3YdfAyp";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

const message = document.getElementById("participant-message");
const list = document.getElementById("participant-list");
const searchInput = document.getElementById("participant-search");

let registrations = [];

async function loadParticipants() {
    try {
        message.textContent = "Loading participants...";
        list.replaceChildren();

        // Verify login
        const { data: sessionData, error: sessionError } =
            await supabaseClient.auth.getSession();

        if (sessionError) throw sessionError;

        if (!sessionData.session) {
            window.location.href = "admin.html";
            return;
        }

        // Verify admin role
        const { data: profile, error: profileError } =
            await supabaseClient
                .from("profiles")
                .select("role")
                .eq("id", sessionData.session.user.id)
                .single();

        if (profileError) throw profileError;

        if (!["admin", "super_admin"].includes(profile.role)) {
            await supabaseClient.auth.signOut();
            window.location.href = "admin.html";
            return;
        }

        // Load registrations without the nonexistent created_at column
        const { data, error } = await supabaseClient
            .from("registrations")
            .select(`
                registration_number,
                section,
                status,
                participants (
                    full_name,
                    contact_number,
                    school_troop,
                    district,
                    email
                )
            `)
            .order("registration_number", { ascending: true });

        if (error) throw error;

        registrations = data || [];
        displayParticipants(registrations);

    } catch (error) {
        message.textContent =
            "Could not load participants: " + error.message;
    }
}

function displayParticipants(items) {
    list.replaceChildren();

    if (items.length === 0) {
        message.textContent = "No matching participants found.";
        return;
    }

    message.textContent = `Total registrations: ${items.length}`;

    items.forEach(registration => {
        const participant = registration.participants || {};

        const card = document.createElement("div");
        card.className = "form-group";

        const heading = document.createElement("h3");
        heading.textContent =
            participant.full_name || "Unknown participant";

        const details = document.createElement("p");

        details.textContent = [
            `Registration: ${registration.registration_number}`,
            `Section: ${registration.section || "-"}`,
            `Contact: ${participant.contact_number || "-"}`,
            `School/Troop: ${participant.school_troop || "-"}`,
            `District: ${participant.district || "-"}`,
            `Email: ${participant.email || "-"}`,
            `Status: ${registration.status || "-"}`
        ].join(" | ");

        card.append(heading, details);
        list.appendChild(card);
    });
}

// Search participants
searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();

    const filtered = registrations.filter(registration => {
        const participant = registration.participants || {};

        const searchableText = [
            registration.registration_number,
            registration.section,
            registration.status,
            participant.full_name,
            participant.contact_number,
            participant.school_troop,
            participant.district,
            participant.email
        ].join(" ").toLowerCase();

        return searchableText.includes(query);
    });

    displayParticipants(filtered);
});

// Start
loadParticipants();
