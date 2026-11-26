
// ==================================================
// PHASE 1 COURSE - PARTICIPANT MANAGEMENT
// ==================================================

const SUPABASE_URL = "https://etfqfyyoagsyiwafziji.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RDrPK0Kus5rKT5v3ioaZ5Q_HY3dfAyp";

const BATCH_ID = "5b1c2d61-dc49-4dc2-b9a6-92ce716eaeff";
const BUCKET = "phase1-result-pdfs";

const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

const message = document.getElementById("participant-message");
const list = document.getElementById("participant-list");
const searchInput = document.getElementById("participant-search");

let registrations = [];
let completions = [];
let adminUser = null;

// ==================================================
// HELPERS
// ==================================================

function showMessage(text) {
    message.textContent = text;
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function safeFilename(name) {
    const clean = String(name || "Participant")
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\s+/g, "_");

    return (clean || "Participant") + ".pdf";
}

function getParticipant(registration) {
    return registration.participants || {};
}

function getCompletion(registrationId) {
    return completions.find(
        item => item.registration_id === registrationId
    );
}

// ==================================================
// ADMIN VERIFICATION
// ==================================================

async function verifyAdmin() {
    const { data, error } = await db.auth.getSession();

    if (error || !data.session) {
        window.location.href = "admin.html";
        return false;
    }

    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("role")
        .eq("id", data.session.user.id)
        .single();

    if (
        profileError ||
        !["admin", "super_admin"].includes(profile?.role)
    ) {
        await db.auth.signOut();
        window.location.href = "admin.html";
        return false;
    }

    adminUser = data.session.user;
    return true;
}

// ==================================================
// LOAD PARTICIPANTS
// ==================================================

async function loadParticipants() {
    try {
        showMessage("Loading participants...");
        list.replaceChildren();

        const { data, error } = await db
            .from("registrations")
            .select(`
                id,
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
            .eq("batch_id", BATCH_ID)
            .neq("status", "cancelled")
            .order("registration_number", { ascending: true });

        if (error) throw error;

        registrations = data || [];

        const { data: completionData, error: completionError } = await db
            .from("course_completions")
            .select("*");

        if (completionError) throw completionError;

        completions = completionData || [];

        displayParticipants(registrations);

    } catch (error) {
        showMessage("Could not load participants: " + error.message);
    }
}

// ==================================================
// PARTICIPANT TABLE
// ==================================================

function displayParticipants(items) {
    list.replaceChildren();

    if (!items.length) {
        showMessage("No matching participants found.");
        return;
    }

    showMessage(`Showing ${items.length} participant(s).`);

    const table = document.createElement("table");
    table.className = "participant-table";

    const headers = [
        "Registration No.",
        "Participant Name",
        "Section",
        "School / Troop",
        "Contact Number",
        "District",
        "Email",
        "Registration Status",
        "Course Complete",
        "Result Sheet"
    ];

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    headers.forEach(title => {
        const th = document.createElement("th");
        th.textContent = title;
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");

    items.forEach(registration => {
        const participant = getParticipant(registration);
        const completion = getCompletion(registration.id);

        const row = document.createElement("tr");

        const values = [
            registration.registration_number,
            participant.full_name,
            registration.section,
            participant.school_troop,
            participant.contact_number,
            participant.district,
            participant.email,
            registration.status
        ];

        values.forEach(value => {
            const td = document.createElement("td");
            td.textContent = value || "-";
            row.appendChild(td);
        });

        // COMPLETION CHECKBOX

        const completionCell = document.createElement("td");
        const label = document.createElement("label");
        label.className = "completion-control";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked =
            completion?.completion_status === "completed";

        const labelText = document.createElement("span");
        labelText.textContent = "Completed";

        label.append(checkbox, labelText);
        completionCell.appendChild(label);

        // PDF BUTTON

        const pdfCell = document.createElement("td");
        pdfCell.className = "participant-actions";

        const pdfButton = document.createElement("button");
        pdfButton.type = "button";
        pdfButton.textContent = "Download Result PDF";
        pdfButton.disabled =
            completion?.completion_status !== "completed";

        pdfCell.appendChild(pdfButton);

        row.append(completionCell, pdfCell);
        tbody.appendChild(row);

        // SAVE COMPLETION STATUS

        checkbox.addEventListener("change", async () => {
            const requestedValue = checkbox.checked;

            checkbox.disabled = true;
            pdfButton.disabled = true;

            showMessage(
                `Saving completion status for ${participant.full_name}...`
            );

            try {
                const completionDate = requestedValue
                    ? new Intl.DateTimeFormat("en-CA", {
                        timeZone: "Asia/Colombo"
                    }).format(new Date())
                    : null;

                const { data, error } = await db
                    .from("course_completions")
                    .upsert({
                        registration_id: registration.id,
                        completion_status: requestedValue
                            ? "completed"
                            : "pending",
                        completion_date: completionDate,
                        approved_by: adminUser.id,
                        approved_at: new Date().toISOString()
                    }, {
                        onConflict: "registration_id"
                    })
                    .select("*")
                    .single();

                if (error) throw error;

                const index = completions.findIndex(
                    item => item.registration_id === registration.id
                );

                if (index >= 0) {
                    completions[index] = data;
                } else {
                    completions.push(data);
                }

                pdfButton.disabled = !requestedValue;

                showMessage(
                    `${participant.full_name}: completion status saved successfully.`
                );

            } catch (error) {
                checkbox.checked = !requestedValue;
                pdfButton.disabled = !checkbox.checked;

                showMessage(
                    "Could not save completion: " + error.message
                );

            } finally {
                checkbox.disabled = false;
            }
        });

        // GENERATE A NEW PDF VERSION AND DOWNLOAD

        pdfButton.addEventListener("click", async () => {
            const currentCompletion = getCompletion(registration.id);

            if (
                !currentCompletion ||
                currentCompletion.completion_status !== "completed"
            ) {
                showMessage("Mark this participant as completed first.");
                return;
            }

            pdfButton.disabled = true;
            pdfButton.textContent = "Generating PDF...";

            try {
                showMessage(
                    `Generating a new result sheet for ${participant.full_name}...`
                );

                const documentRecord = await generatePDF(
                    registration,
                    currentCompletion
                );

                const { data: file, error } = await db.storage
                    .from(BUCKET)
                    .download(documentRecord.storage_path);

                if (error) throw error;

                const url = URL.createObjectURL(file);
                const link = document.createElement("a");

                link.href = url;
                link.download = safeFilename(participant.full_name);

                document.body.appendChild(link);
                link.click();
                link.remove();

                setTimeout(() => URL.revokeObjectURL(url), 2000);

                showMessage(
                    `New result sheet downloaded for ${participant.full_name}.`
                );

                pdfButton.textContent = "Download New Version";

            } catch (error) {
                showMessage("PDF generation failed: " + error.message);
                pdfButton.textContent = "Download Result PDF";

            } finally {
                pdfButton.disabled = false;
            }
        });
    });

    table.append(thead, tbody);
    list.appendChild(table);
}

// ==================================================
// PROFESSIONAL A4 COURSE COMPLETION RESULT SHEET
// ==================================================

async function createResultSheet(registration, completion) {
    const participant = getParticipant(registration);

    const sheet = document.createElement("div");

    sheet.style.cssText = `
        width: 180mm;
        min-height: 267mm;
        padding: 14mm;
        background: #ffffff;
        color: #263b30;
        font-family: Georgia, 'Times New Roman', serif;
        box-sizing: border-box;
        position: relative;
    `;

    const mpLogo = new URL("mp.png", window.location.href).href;
    const scoutLogo = new URL("sl.png", window.location.href).href;

    sheet.innerHTML = `
        <div style="
            border:2px solid #245b40;
            padding:8mm;
            min-height:235mm;
            box-sizing:border-box;
            position:relative;
        ">

            <div style="
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:12px;
                border-bottom:2px solid #245b40;
                padding-bottom:18px;
            ">
                <img
                    src="${mpLogo}"
                    alt="Organization Logo"
                    style="width:82px;height:82px;object-fit:contain;"
                >

                <div style="text-align:center;flex:1;">
                    <div style="
                        font-family:Arial,sans-serif;
                        font-size:11px;
                        letter-spacing:3px;
                        color:#758579;
                        margin-bottom:8px;
                    ">SCOUT LEADER DEVELOPMENT</div>

                    <h1 style="
                        font-family:Georgia,serif;
                        font-size:25px;
                        color:#17452e;
                        margin:0;
                        letter-spacing:1px;
                    ">PHASE 1 COURSE</h1>

                    <div style="
                        font-family:Arial,sans-serif;
                        font-size:11px;
                        letter-spacing:2px;
                        margin-top:8px;
                        color:#64756a;
                    ">OFFICIAL COURSE DOCUMENT</div>
                </div>

                <img
                    src="${scoutLogo}"
                    alt="Scout Logo"
                    style="width:82px;height:82px;object-fit:contain;"
                >
            </div>

            <div style="
                text-align:center;
                margin:35px 0 28px;
            ">
                <div style="
                    font-family:Arial,sans-serif;
                    font-size:11px;
                    letter-spacing:4px;
                    color:#8a9a8e;
                    margin-bottom:12px;
                ">CERTIFICATE OF</div>

                <h2 style="
                    font-size:29px;
                    color:#245b40;
                    margin:0;
                    letter-spacing:1px;
                    font-weight:normal;
                ">COURSE COMPLETION</h2>

                <div style="
                    width:65px;
                    height:2px;
                    background:#b89b58;
                    margin:18px auto;
                "></div>

                <p style="
                    font-family:Arial,sans-serif;
                    font-size:13px;
                    color:#65746a;
                    margin:0;
                ">This document confirms the successful completion of</p>

                <h2 style="
                    font-size:25px;
                    color:#183d2b;
                    margin:18px 0 8px;
                    padding-bottom:10px;
                    border-bottom:1px solid #cbd8ce;
                    display:inline-block;
                    min-width:75%;
                ">${escapeHTML(participant.full_name)}</h2>

                <p style="
                    font-family:Arial,sans-serif;
                    font-size:13px;
                    color:#65746a;
                    margin:8px 0;
                ">of the Phase 1 Course</p>
            </div>

            <div style="
                background:#f1f6f2;
                border:1px solid #d7e4d9;
                padding:18px 20px;
                margin-top:25px;
            ">
                <h3 style="
                    font-family:Arial,sans-serif;
                    font-size:12px;
                    letter-spacing:2px;
                    color:#245b40;
                    margin:0 0 14px;
                ">PARTICIPANT DETAILS</h3>

                <table style="
                    width:100%;
                    border-collapse:collapse;
                    font-family:Arial,sans-serif;
                    font-size:12px;
                ">
                    <tr>
                        <td style="padding:9px 5px;color:#718075;width:42%;">Registration Number</td>
                        <td style="padding:9px 5px;font-weight:bold;">${escapeHTML(registration.registration_number)}</td>
                    </tr>
                    <tr>
                        <td style="padding:9px 5px;color:#718075;">Scouting Section</td>
                        <td style="padding:9px 5px;font-weight:bold;">${escapeHTML(registration.section)}</td>
                    </tr>
                    <tr>
                        <td style="padding:9px 5px;color:#718075;">School / Troop</td>
                        <td style="padding:9px 5px;font-weight:bold;">${escapeHTML(participant.school_troop)}</td>
                    </tr>
                    <tr>
                        <td style="padding:9px 5px;color:#718075;">District</td>
                        <td style="padding:9px 5px;font-weight:bold;">${escapeHTML(participant.district)}</td>
                    </tr>
                    <tr>
                        <td style="padding:9px 5px;color:#718075;">Completion Date</td>
                        <td style="padding:9px 5px;font-weight:bold;">${escapeHTML(completion.completion_date || "-")}</td>
                    </tr>
                </table>
            </div>

            <div style="
                text-align:center;
                margin:24px 0 0;
                padding:14px;
                border:1px solid #b8d0bd;
            ">
                <div style="
                    font-family:Arial,sans-serif;
                    font-size:10px;
                    letter-spacing:2px;
                    color:#758579;
                ">COURSE STATUS</div>

                <div style="
                    font-family:Arial,sans-serif;
                    font-size:19px;
                    font-weight:bold;
                    letter-spacing:3px;
                    color:#245b40;
                    margin-top:7px;
                ">✓ COMPLETED</div>
            </div>

            <div style="
                display:flex;
                justify-content:space-between;
                gap:30px;
                margin-top:65px;
                font-family:Arial,sans-serif;
                font-size:12px;
                text-align:center;
            ">
                <div style="width:50%;">
                    <div style="height:35px;border-bottom:1px solid #52665a;"></div>
                    <div style="font-weight:bold;margin-top:10px;color:#244b35;">Course Leader</div>
                    <div style="font-size:10px;color:#7b897f;margin-top:4px;">Signature</div>
                </div>

                <div style="width:50%;">
                    <div style="height:35px;border-bottom:1px solid #52665a;"></div>
                    <div style="font-weight:bold;margin-top:10px;color:#244b35;">District Commissioner</div>
                    <div style="font-size:10px;color:#7b897f;margin-top:4px;">Signature</div>
                </div>
            </div>

            <div style="
                position:absolute;
                bottom:10mm;
                left:8mm;
                right:8mm;
                border-top:1px solid #dce5dd;
                padding-top:10px;
                text-align:center;
                font-family:Arial,sans-serif;
                font-size:9px;
                letter-spacing:1px;
                color:#849187;
            ">
                PHASE 1 COURSE · SCOUT LEADER DEVELOPMENT
            </div>
        </div>
    `;

    document.body.appendChild(sheet);

    // WAIT FOR BOTH LOGOS

    const images = Array.from(sheet.querySelectorAll("img"));

    await Promise.all(images.map(img => {
        if (img.complete && img.naturalWidth > 0) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(
                new Error("Could not load a course logo. Check mp.png and sl.png.")
            );
        });
    }));

    return sheet;
}

// ==================================================
// GENERATE AND STORE A NEW PDF VERSION
// ==================================================

async function generatePDF(registration, completion) {
    if (typeof window.html2pdf !== "function") {
        throw new Error("PDF library not loaded. Refresh the page and try again.");
    }

    const { data: previousDocuments, error: versionError } = await db
        .from("result_documents")
        .select("version")
        .eq("completion_id", completion.id)
        .order("version", { ascending: false })
        .limit(1);

    if (versionError) throw versionError;

    const version = (previousDocuments?.[0]?.version || 0) + 1;

    const sheet = await createResultSheet(registration, completion);

    let pdfBlob;

    try {
        pdfBlob = await window.html2pdf()
            .set({
                margin: 5,
                filename: safeFilename(
                    getParticipant(registration).full_name
                ),
                image: {
                    type: "jpeg",
                    quality: 0.98
                },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: "#ffffff"
                },
                jsPDF: {
                    unit: "mm",
                    format: "a4",
                    orientation: "portrait"
                },
                pagebreak: {
                    mode: ["avoid-all", "css", "legacy"]
                }
            })
            .from(sheet)
            .outputPdf("blob");

    } finally {
        sheet.remove();
    }

    const filePath =
        `${registration.registration_number}/result-v${version}.pdf`;

    const { error: uploadError } = await db.storage
        .from(BUCKET)
        .upload(filePath, pdfBlob, {
            contentType: "application/pdf",
            upsert: false
        });

    if (uploadError) throw uploadError;

    const { data: savedDocument, error: recordError } = await db
        .from("result_documents")
        .insert({
            completion_id: completion.id,
            document_number:
                `${registration.registration_number}-V${version}`,
            storage_path: filePath,
            version,
            generated_by: adminUser.id
        })
        .select("*")
        .single();

    if (recordError) {
        throw new Error(
            "PDF uploaded, but document record failed: " +
            recordError.message
        );
    }

    return savedDocument;
}

// ==================================================
// SEARCH PARTICIPANTS
// ==================================================

searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();

    const filtered = registrations.filter(registration => {
        const participant = getParticipant(registration);

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

// ==================================================
// START SYSTEM
// ==================================================

async function start() {
    try {
        if (!await verifyAdmin()) return;

        await loadParticipants();

    } catch (error) {
        showMessage("System error: " + error.message);
    }
}

start();
