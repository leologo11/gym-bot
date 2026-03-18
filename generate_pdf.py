#!/usr/bin/env python3
# generate_pdf.py - Genera PDF del plan semanal MAX
import sys
import json
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, PageBreak
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

# Colores MAX
LIME = colors.HexColor('#c8ff00')
BLACK = colors.HexColor('#0a0a0a')
DARK = colors.HexColor('#141414')
GRAY = colors.HexColor('#1e1e1e')
GRAY2 = colors.HexColor('#2a2a2a')
WHITE = colors.HexColor('#ffffff')
TEAL = colors.HexColor('#00e5c8')
ORANGE = colors.HexColor('#ff6b35')
RED = colors.HexColor('#ff4444')

def build_pdf(data_file):
    with open(data_file) as f:
        data = json.load(f)

    usuario = data['usuario']
    plan = data['plan']
    output = data['output']

    doc = SimpleDocTemplate(output, pagesize=A4,
        leftMargin=15*mm, rightMargin=15*mm,
        topMargin=15*mm, bottomMargin=15*mm)

    # Estilos
    def style(name, **kw):
        s = ParagraphStyle(name, fontName='Helvetica', fontSize=10, textColor=WHITE, **kw)
        return s

    s_title = style('title', fontSize=28, fontName='Helvetica-Bold', textColor=LIME, spaceAfter=2)
    s_sub = style('sub', fontSize=11, textColor=colors.HexColor('#888888'), spaceAfter=8)
    s_h1 = style('h1', fontSize=16, fontName='Helvetica-Bold', textColor=LIME, spaceBefore=12, spaceAfter=4)
    s_h2 = style('h2', fontSize=13, fontName='Helvetica-Bold', textColor=WHITE, spaceBefore=8, spaceAfter=3)
    s_h3 = style('h3', fontSize=11, fontName='Helvetica-Bold', textColor=TEAL, spaceBefore=5, spaceAfter=2)
    s_body = style('body', fontSize=9, textColor=colors.HexColor('#cccccc'), spaceAfter=2, leading=13)
    s_small = style('small', fontSize=8, textColor=colors.HexColor('#888888'), spaceAfter=1)
    s_chip = style('chip', fontSize=8, fontName='Helvetica-Bold', textColor=BLACK)
    s_label = style('label', fontSize=8, fontName='Helvetica-Bold', textColor=colors.HexColor('#666666'))
    s_center = style('center', fontSize=9, textColor=WHITE, alignment=TA_CENTER)

    story = []

    # ── PORTADA ──────────────────────────────────────────────────────────────
    story.append(Spacer(1, 20*mm))

    # Logo MAX
    logo_data = [['MAX  ELITE COACH']]
    logo_table = Table(logo_data, colWidths=[180*mm])
    logo_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), BLACK),
        ('TEXTCOLOR', (0,0), (-1,-1), LIME),
        ('FONTNAME', (0,0), (-1,-1), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 32),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(logo_table)
    story.append(HRFlowable(width='100%', thickness=2, color=LIME))
    story.append(Spacer(1, 6*mm))

    story.append(Paragraph(f"PLAN SEMANAL PERSONALIZADO", s_title))
    story.append(Paragraph(f"{plan.get('semana_label','')}", s_sub))
    story.append(Spacer(1, 8*mm))

    # Info usuario
    macros = usuario.get('macros', {})
    user_data = [
        ['ATLETA', usuario.get('nombre','').upper()],
        ['OBJETIVO', usuario.get('objetivo','').upper()],
        ['NIVEL', usuario.get('nivel','').upper()],
        ['PESO / ALTURA', f"{usuario.get('peso',0)} kg / {usuario.get('altura',0)} cm"],
        ['CALORIAS DIARIAS', f"{macros.get('calorias_objetivo',0)} kcal"],
        ['MACROS', f"P: {macros.get('proteinas_g',0)}g  |  C: {macros.get('carbohidratos_g',0)}g  |  G: {macros.get('grasas_g',0)}g"],
    ]
    t = Table(user_data, colWidths=[50*mm, 130*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,-1), DARK),
        ('BACKGROUND', (1,0), (1,-1), GRAY),
        ('TEXTCOLOR', (0,0), (0,-1), colors.HexColor('#888888')),
        ('TEXTCOLOR', (1,0), (1,-1), WHITE),
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
        ('FONTNAME', (1,0), (1,-1), 'Helvetica'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('ROWBACKGROUNDS', (1,0), (1,-1), [GRAY, GRAY2]),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LINEBELOW', (0,0), (-1,-2), 0.5, colors.HexColor('#2a2a2a')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#333333')),
    ]))
    story.append(t)
    story.append(Spacer(1, 6*mm))
    story.append(HRFlowable(width='100%', thickness=0.5, color=colors.HexColor('#333333')))
    story.append(Paragraph("Generado por MAX — Elite Fitness Coach", s_small))

    # ── DÍAS ─────────────────────────────────────────────────────────────────
    dias = plan.get('dias', [])
    for dia_obj in dias:
        story.append(PageBreak())

        dia_nombre = dia_obj.get('dia', '')
        es_descanso = dia_obj.get('es_descanso', False)

        # Header del día
        color_header = colors.HexColor('#1a2a00') if not es_descanso else colors.HexColor('#1a1a1a')
        dia_header = [[dia_nombre.upper() + ('  —  DIA DE ENTRENAMIENTO' if not es_descanso else '  —  DIA DE DESCANSO')]]
        th = Table(dia_header, colWidths=[180*mm])
        th.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), color_header),
            ('TEXTCOLOR', (0,0), (-1,-1), LIME if not es_descanso else colors.HexColor('#666666')),
            ('FONTNAME', (0,0), (-1,-1), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,-1), 14),
            ('LEFTPADDING', (0,0), (-1,-1), 12),
            ('TOPPADDING', (0,0), (-1,-1), 10),
            ('BOTTOMPADDING', (0,0), (-1,-1), 10),
            ('BOX', (0,0), (-1,-1), 1.5, LIME if not es_descanso else colors.HexColor('#333333')),
        ]))
        story.append(th)
        story.append(Spacer(1, 4*mm))

        # ── NUTRICION ────────────────────────────────────────────────────────
        comidas = dia_obj.get('comidas', [])
        if comidas:
            story.append(Paragraph("🥗  NUTRICION", s_h1))
            story.append(HRFlowable(width='100%', thickness=1, color=TEAL))
            story.append(Spacer(1, 2*mm))

            for i, comida in enumerate(comidas):
                nombre = comida.get('nombre', '')
                tipo = comida.get('tipo', '').upper()
                cal = comida.get('calorias', 0)
                prot = comida.get('proteinas_g', 0)
                carb = comida.get('carbohidratos_g', 0)
                gras = comida.get('grasas_g', 0)
                sodio = comida.get('sodio_mg', '')
                azucar = comida.get('azucar_g', '')
                fibra = comida.get('fibra_g', '')
                instrucciones = comida.get('instrucciones', '')
                condimentos = comida.get('condimentos', [])
                tiempo = comida.get('tiempo_preparacion_min', '')

                ingredientes = comida.get('ingredientes', [])
                ing_str = ''
                if ingredientes:
                    partes = []
                    for ing in ingredientes:
                        if isinstance(ing, dict):
                            partes.append(f"{ing.get('cantidad','')} {ing.get('unidad','')} {ing.get('nombre','')}".strip())
                        else:
                            partes.append(str(ing))
                    ing_str = ' • '.join(partes)

                # Nombre comida
                story.append(Paragraph(f"<b>{nombre}</b>", s_h2))

                # Macros chips
                chips = [
                    [f"🔥 {cal} kcal", f"P: {prot}g", f"C: {carb}g", f"G: {gras}g",
                     f"Na: {sodio}mg" if sodio else '', f"Az: {azucar}g" if azucar else '', f"Fi: {fibra}g" if fibra else '']
                ]
                chips_clean = [[x for x in row if x] for row in chips]
                n_cols = len(chips_clean[0])
                col_w = 180*mm / max(n_cols, 1)
                chip_t = Table(chips_clean, colWidths=[col_w]*n_cols)
                chip_t.setStyle(TableStyle([
                    ('BACKGROUND', (0,0), (0,-1), colors.HexColor('#1a2a00')),
                    ('BACKGROUND', (1,0), (1,-1), colors.HexColor('#002a1a')),
                    ('BACKGROUND', (2,0), (2,-1), colors.HexColor('#1a1a2a')),
                    ('BACKGROUND', (3,0), (3,-1), colors.HexColor('#2a1a00')),
                    ('TEXTCOLOR', (0,0), (0,-1), LIME),
                    ('TEXTCOLOR', (1,0), (1,-1), TEAL),
                    ('TEXTCOLOR', (2,0), (2,-1), colors.HexColor('#8888ff')),
                    ('TEXTCOLOR', (3,0), (3,-1), ORANGE),
                    ('TEXTCOLOR', (4,0), (-1,-1), colors.HexColor('#888888')),
                    ('FONTNAME', (0,0), (-1,-1), 'Helvetica-Bold'),
                    ('FONTSIZE', (0,0), (-1,-1), 8),
                    ('ALIGN', (0,0), (-1,-1), 'CENTER'),
                    ('TOPPADDING', (0,0), (-1,-1), 4),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 4),
                    ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#333333')),
                    ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#333333')),
                ]))
                story.append(chip_t)

                # Ingredientes
                if ing_str:
                    story.append(Spacer(1, 1*mm))
                    story.append(Paragraph(f"<b>Ingredientes:</b> {ing_str}", s_body))

                # Condimentos
                if condimentos:
                    story.append(Paragraph(f"<b>Condimentos:</b> {', '.join(condimentos)}", s_body))

                # Instrucciones
                if instrucciones:
                    story.append(Paragraph(f"<b>Preparacion:</b> {instrucciones}{(' ('+str(tiempo)+' min)') if tiempo else ''}", s_body))

                # Registro box
                reg_data = [['REGISTRO DEL DIA', '', ''], ['Completado:', '[ ] Si  [ ] No', f"Hora: ________"], ['Notas:', '', '']]
                reg_t = Table(reg_data, colWidths=[40*mm, 80*mm, 60*mm])
                reg_t.setStyle(TableStyle([
                    ('BACKGROUND', (0,0), (-1,0), DARK),
                    ('TEXTCOLOR', (0,0), (-1,0), colors.HexColor('#666666')),
                    ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0,0), (-1,-1), 7),
                    ('TEXTCOLOR', (0,1), (-1,-1), colors.HexColor('#888888')),
                    ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#2a2a2a')),
                    ('INNERGRID', (0,1), (-1,-1), 0.5, colors.HexColor('#2a2a2a')),
                    ('LEFTPADDING', (0,0), (-1,-1), 6),
                    ('TOPPADDING', (0,0), (-1,-1), 3),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 3),
                    ('SPAN', (1,2), (2,2)),
                ]))
                story.append(Spacer(1, 1*mm))
                story.append(reg_t)
                story.append(Spacer(1, 3*mm))

        # ── EJERCICIOS ───────────────────────────────────────────────────────
        ejercicios = dia_obj.get('ejercicios', [])
        if ejercicios and not es_descanso:
            story.append(Spacer(1, 3*mm))
            story.append(Paragraph("💪  ENTRENAMIENTO", s_h1))
            story.append(HRFlowable(width='100%', thickness=1, color=LIME))
            story.append(Spacer(1, 2*mm))

            for i, ex in enumerate(ejercicios):
                nombre = ex.get('nombre', '')
                desc = ex.get('descripcion', '')
                grupo = ex.get('grupo_muscular', '')
                nivel_ex = ex.get('nivel_dificultad', '')
                series = ex.get('series', 0)
                reps = ex.get('reps', '')
                peso = ex.get('peso_kg', 0)
                descanso = ex.get('descanso_seg', 90)
                notas = ex.get('notas', '')
                tips = ex.get('tips', '')

                story.append(Paragraph(f"<b>{i+1}. {nombre}</b>", s_h2))

                # Info row
                info_data = [[f"{series} series", f"{reps} reps", f"{peso}kg ref.", f"{descanso}s descanso", grupo, nivel_ex]]
                info_t = Table(info_data, colWidths=[28*mm, 28*mm, 28*mm, 30*mm, 36*mm, 30*mm])
                info_t.setStyle(TableStyle([
                    ('BACKGROUND', (0,0), (0,-1), colors.HexColor('#1a2a00')),
                    ('BACKGROUND', (1,0), (1,-1), colors.HexColor('#1a2a00')),
                    ('BACKGROUND', (2,0), (2,-1), colors.HexColor('#2a1a00')),
                    ('BACKGROUND', (3,0), (3,-1), colors.HexColor('#1a1a2a')),
                    ('BACKGROUND', (4,0), (4,-1), DARK),
                    ('BACKGROUND', (5,0), (5,-1), DARK),
                    ('TEXTCOLOR', (0,0), (1,-1), LIME),
                    ('TEXTCOLOR', (2,0), (2,-1), ORANGE),
                    ('TEXTCOLOR', (3,0), (3,-1), TEAL),
                    ('TEXTCOLOR', (4,0), (-1,-1), colors.HexColor('#888888')),
                    ('FONTNAME', (0,0), (-1,-1), 'Helvetica-Bold'),
                    ('FONTSIZE', (0,0), (-1,-1), 8),
                    ('ALIGN', (0,0), (-1,-1), 'CENTER'),
                    ('TOPPADDING', (0,0), (-1,-1), 4),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 4),
                    ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#333333')),
                    ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#333333')),
                ]))
                story.append(info_t)

                if desc:
                    story.append(Spacer(1, 1*mm))
                    story.append(Paragraph(f"<b>Como hacerlo:</b> {desc}", s_body))
                if tips:
                    story.append(Paragraph(f"<b>Tip:</b> {tips}", s_body))
                if notas:
                    story.append(Paragraph(f"<i>{notas}</i>", s_small))

                # Tabla de registro por series
                reg_header = ['Serie', 'Peso usado (kg)', 'Reps completadas', 'Sensacion', 'Notas']
                reg_rows = [reg_header]
                for s in range(series):
                    reg_rows.append([f"Serie {s+1}", '________', '________', '[ ]Facil [ ]Normal [ ]Dificil', ''])
                reg_t = Table(reg_rows, colWidths=[18*mm, 35*mm, 35*mm, 55*mm, 37*mm])
                reg_style = [
                    ('BACKGROUND', (0,0), (-1,0), DARK),
                    ('TEXTCOLOR', (0,0), (-1,0), colors.HexColor('#666666')),
                    ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0,0), (-1,-1), 7),
                    ('TEXTCOLOR', (0,1), (-1,-1), colors.HexColor('#888888')),
                    ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#2a2a2a')),
                    ('INNERGRID', (0,0), (-1,-1), 0.3, colors.HexColor('#2a2a2a')),
                    ('ROWBACKGROUNDS', (0,1), (-1,-1), [GRAY, GRAY2]),
                    ('LEFTPADDING', (0,0), (-1,-1), 5),
                    ('TOPPADDING', (0,0), (-1,-1), 4),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 4),
                    ('ALIGN', (0,0), (-1,-1), 'CENTER'),
                ]
                reg_t.setStyle(TableStyle(reg_style))
                story.append(Spacer(1, 1*mm))
                story.append(reg_t)
                story.append(Spacer(1, 4*mm))

        elif es_descanso:
            story.append(Spacer(1, 6*mm))
            rest_data = [['DIA DE DESCANSO Y RECUPERACION'],
                        ['Aprovecha para: estiramientos suaves, caminata ligera, meditacion, hidratacion extra'],
                        ['Recuerda: el musculo crece en el descanso, no durante el entrenamiento']]
            rest_t = Table(rest_data, colWidths=[180*mm])
            rest_t.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,0), DARK),
                ('BACKGROUND', (0,1), (-1,-1), GRAY),
                ('TEXTCOLOR', (0,0), (-1,0), colors.HexColor('#666666')),
                ('TEXTCOLOR', (0,1), (-1,-1), colors.HexColor('#888888')),
                ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
                ('FONTSIZE', (0,0), (-1,-1), 9),
                ('ALIGN', (0,0), (-1,-1), 'CENTER'),
                ('LEFTPADDING', (0,0), (-1,-1), 12),
                ('TOPPADDING', (0,0), (-1,-1), 8),
                ('BOTTOMPADDING', (0,0), (-1,-1), 8),
                ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#333333')),
            ]))
            story.append(rest_t)

    # Pie de página
    story.append(PageBreak())
    story.append(Spacer(1, 40*mm))
    story.append(HRFlowable(width='100%', thickness=2, color=LIME))
    story.append(Spacer(1, 4*mm))
    story.append(Paragraph("MAX — ELITE FITNESS COACH", s_title))
    story.append(Paragraph("Tu plan es personalizado. Escucha tu cuerpo y ajusta segun como te sientas.", s_sub))
    story.append(Paragraph("Cualquier cambio puedes pedirlo por WhatsApp o desde la app web.", s_body))

    # Build with black background
    def on_page(canvas, doc):
        canvas.setFillColor(BLACK)
        canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(f"PDF generado: {output}")

if __name__ == '__main__':
    build_pdf(sys.argv[1])
