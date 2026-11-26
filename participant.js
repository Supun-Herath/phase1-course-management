
// ==================================================
// PHASE 1 COURSE - PARTICIPANT MANAGEMENT
// ==================================================

const SUPABASE_URL = "https://etfqfyyoagsyiwafziji.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-nAhlgK3wSaRQdZI_TKEhQ_KUHdI5b-";

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
    if (message) message.textContent = text;
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

    if (error) {
        showMessage("Session error: " + error.message);
        return false;
    }

    if (!data.session) {
        showMessage("No active login session. Please log in again.");
        return false;
    }

    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("role")
        .eq("id", data.session.user.id)
        .single();

    if (profileError) {
        showMessage("Admin profile error: " + profileError.message);
        return false;
    }

    if (!["admin", "super_admin"].includes(profile?.role)) {
        showMessage(
            "Admin access denied. Role found: " +
            (profile?.role || "none")
        );
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

        if (!list) {
            throw new Error("Participant table container not found.");
        }

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

        // GENERATE NEW PDF VERSION AND DOWNLOAD

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
// PROFESSIONAL A4 COURSE COMPLETION CERTIFICATE
// ==================================================

async function createResultSheet(registration, completion) {
    const participant = getParticipant(registration);

    const sheet = document.createElement("div");

    // Reduced sheet size for a centred A4 layout
    sheet.style.cssText = `
        width: 180mm;
        height: 254mm;
        min-width: 180mm;
        max-width: 180mm;
        padding: 8mm;
        margin: 0;
        box-sizing: border-box;
        background: #ffffff;
        color: #263b30;
        font-family: Arial, Helvetica, sans-serif;
        position: relative;
        overflow: hidden;
    `;

    const mpLogo = new URL("mp.png", window.location.href).href;
    const scoutLogo = new URL("sl.png", window.location.href).href;

    sheet.innerHTML = `
        <div style="
            width:100%;
            height:100%;
            box-sizing:border-box;
            border:2px solid #24583e;
            padding:8mm;
            position:relative;
            background:#ffffff;
            font-family:Arial,Helvetica,sans-serif;
        ">

            <!-- HEADER -->

            <div style="
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:8px;
                border-bottom:2px solid #24583e;
                padding-bottom:5mm;
            ">
                <img src="${mpLogo}" alt="Organization Logo"
                    style="
                        width:20mm;
                        height:20mm;
                        object-fit:contain;
                        flex-shrink:0;
                    ">

                <div style="flex:1;text-align:center;">
                    <div style="
                        font-size:8px;
                        font-weight:600;
                        letter-spacing:1.5px;
                        color:#718075;
                        margin-bottom:4px;
                    ">SCOUT LEADER DEVELOPMENT</div>

                    <div style="
                        font-size:19px;
                        font-weight:700;
                        letter-spacing:0.5px;
                        color:#17452e;
                    ">PHASE 1 COURSE</div>

                    <div style="
                        font-size:8px;
                        letter-spacing:1px;
                        color:#718075;
                        margin-top:4px;
                    ">OFFICIAL COURSE DOCUMENT</div>
                </div>

                <img src="${scoutLogo}" alt="Scout Logo"
                    style="
                        width:20mm;
                        height:20mm;
                        object-fit:contain;
                        flex-shrink:0;
                    ">
            </div>

            <!-- CERTIFICATE TITLE -->

            <div style="
                text-align:center;
                margin-top:10mm;
            ">
                <div style="
                    font-size:9px;
                    font-weight:600;
                    letter-spacing:2px;
                    color:#8a9a8e;
                    margin-bottom:6px;
                ">CERTIFICATE OF</div>

                <div style="
                    font-size:21px;
                    font-weight:700;
                    color:#24583e;
                    letter-spacing:0.3px;
                ">COURSE COMPLETION</div>

                <div style="
                    width:18mm;
                    height:1mm;
                    background:#b89b58;
                    margin:5mm auto;
                "></div>

                <div style="
                    font-size:10px;
                    color:#65746a;
                ">This document confirms the successful completion of</div>

                <div style="
                    font-size:18px;
                    font-weight:700;
                    color:#183d2b;
                    margin:6mm 0 2mm;
                    padding-bottom:2mm;
                    border-bottom:1px solid #cbd8ce;
                    overflow-wrap:anywhere;
                ">${escapeHTML(participant.full_name)}</div>

                <div style="
                    font-size:11px;
                    color:#65746a;
                ">of the Phase 1 Course</div>
            </div>

            <!-- PARTICIPANT DETAILS -->

            <div style="
                background:#f1f6f2;
                border:1px solid #d7e4d9;
                padding:5mm;
                margin-top:8mm;
                box-sizing:border-box;
            ">
                <div style="
                    font-size:9px;
                    font-weight:700;
                    letter-spacing:1.2px;
                    color:#24583e;
                    margin-bottom:3mm;
                ">PARTICIPANT DETAILS</div>

                <table style="
                    width:100%;
                    border-collapse:collapse;
                    font-family:Arial,Helvetica,sans-serif;
                    font-size:9px;
                    table-layout:fixed;
                ">
                    <tr>
                        <td style="
                            padding:2.5mm 2mm;
                            color:#718075;
                            width:43%;
                            border-bottom:1px solid #dce5dd;
                        ">Registration Number</td>
                        <td style="
                            padding:2.5mm 2mm;
                            font-weight:700;
                            color:#263b30;
                            border-bottom:1px solid #dce5dd;
                            overflow-wrap:anywhere;
                        ">${escapeHTML(registration.registration_number)}</td>
                    </tr>

                    <tr>
                        <td style="
                            padding:2.5mm 2mm;
                            color:#718075;
                            border-bottom:1px solid #dce5dd;
                        ">Scouting Section</td>
                        <td style="
                            padding:2.5mm 2mm;
                            font-weight:700;
                            color:#263b30;
                            border-bottom:1px solid #dce5dd;
                        ">${escapeHTML(registration.section)}</td>
                    </tr>

                    <tr>
                        <td style="
                            padding:2.5mm 2mm;
                            color:#718075;
                            border-bottom:1px solid #dce5dd;
                        ">School / Troop</td>
                        <td style="
                            padding:2.5mm 2mm;
                            font-weight:700;
                            color:#263b30;
                            border-bottom:1px solid #dce5dd;
                            overflow-wrap:anywhere;
                        ">${escapeHTML(participant.school_troop)}</td>
                    </tr>

                    <tr>
                        <td style="
                            padding:2.5mm 2mm;
                            color:#718075;
                            border-bottom:1px solid #dce5dd;
                        ">District</td>
                        <td style="
                            padding:2.5mm 2mm;
                            font-weight:700;
                            color:#263b30;
                            border-bottom:1px solid #dce5dd;
                        ">${escapeHTML(participant.district)}</td>
                    </tr>

                    <tr>
                        <td style="
                            padding:2.5mm 2mm;
                            color:#718075;
                        ">Completion Date</td>
                        <td style="
                            padding:2.5mm 2mm;
                            font-weight:700;
                            color:#263b30;
                        ">${escapeHTML(completion.completion_date || "-")}</td>
                    </tr>
                </table>
            </div>

            <!-- COMPLETION STATUS -->

            <div style="
                text-align:center;
                margin-top:7mm;
                padding:4mm;
                border:1px solid #b8d0bd;
                box-sizing:border-box;
            ">
                <div style="
                    font-size:8px;
                    font-weight:600;
                    letter-spacing:1.5px;
                    color:#758579;
                ">COURSE STATUS</div>

                <div style="
                    font-size:15px;
                    font-weight:700;
                    letter-spacing:1.5px;
                    color:#24583e;
                    margin-top:2mm;
                ">✓ COMPLETED</div>
            </div>

            <!-- SIGNATURES -->

            <div style="
                position:absolute;
                bottom:21mm;
                left:8mm;
                right:8mm;
                display:flex;
                justify-content:space-between;
                gap:12mm;
                font-family:Arial,Helvetica,sans-serif;
                font-size:9px;
                text-align:center;
            ">
                <div style="flex:1;">
                    <div style="
                        height:10mm;
                        border-bottom:1px solid #52665a;
                    "></div>

                    <div style="
                        font-weight:700;
                        margin-top:2mm;
                        color:#244b35;
                    ">Course Leader</div>

                    <div style="
                        font-size:8px;
                        color:#7b897f;
                        margin-top:2px;
                    ">Signature</div>
                </div>

                <div style="flex:1;">
                    <div style="
                        height:10mm;
                        border-bottom:1px solid #52665a;
                    "></div>

                    <div style="
                        font-weight:700;
                        margin-top:2mm;
                        color:#244b35;
                    ">District Commissioner</div>

                    <div style="
                        font-size:8px;
                        color:#7b897f;
                        margin-top:2px;
                    ">Signature</div>
                </div>
            </div>

            <!-- FOOTER -->

            <div style="
                position:absolute;
                bottom:6mm;
                left:8mm;
                right:8mm;
                border-top:1px solid #dce5dd;
                padding-top:2mm;
                text-align:center;
                font-size:7px;
                letter-spacing:0.8px;
                color:#849187;
            ">
                PHASE 1 COURSE · SCOUT LEADER DEVELOPMENT
            </div>

        </div>
    `;

    document.body.appendChild(sheet);

    try {
        const images = Array.from(sheet.querySelectorAll("img"));

        await Promise.all(images.map(img => {
            if (img.complete) {
                return img.naturalWidth > 0
                    ? Promise.resolve()
                    : Promise.reject(
                        new Error("Could not load a course logo. Check mp.png and sl.png.")
                    );
            }

            return new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(
                    new Error("Could not load a course logo. Check mp.png and sl.png.")
                );
            });
        }));

        return sheet;

    } catch (error) {
        sheet.remove();
        throw error;
    }
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
                // Equal margins centre the smaller sheet on A4.
                // Available content area: 180mm x 254mm.
                margin: [21.5, 15, 21.5, 15],

                filename: safeFilename(
                    registration.registration_number
                ),

                image: {
                    type: "jpeg",
                    quality: 0.98
                },

                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: "#ffffff",
                    scrollY: 0,
                    scrollX: 0,
                    windowWidth: 794,
                    windowHeight: 1123
                },

                jsPDF: {
                    unit: "mm",
                    format: "a4",
                    orientation: "portrait",
                    compress: true
                },

                pagebreak: {
                    mode: []
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

if (searchInput) {
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
}

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
